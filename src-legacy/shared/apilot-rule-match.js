/**
 * Single source of truth for APIlot rule matching (DevTools panel + background).
 * Keep in sync if you change matching semantics.
 */
var ApilotRuleMatch = (function () {
  'use strict';

  function getUrlPath(url) {
    try {
      return new URL(url).pathname;
    } catch (e) {
      return url;
    }
  }

  function getEndpointFromUrl(url) {
    try {
      const segments = new URL(url).pathname.split('/').filter(Boolean);
      return segments.length ? segments[segments.length - 1].split('?')[0] : '';
    } catch (e) {
      return '';
    }
  }

  function patternMatches(pattern, value) {
    if (!pattern || !value) return false;
    if (!pattern.includes('*')) {
      return pattern.toLowerCase() === String(value).toLowerCase();
    }
    const regexPattern = String(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp('^' + regexPattern + '$', 'i').test(String(value));
  }

  function pathPatternMatches(pattern, path) {
    if (!pattern || !path) return false;
    const regexPattern = String(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:\w+/g, '[^/]+')
      .replace(/\*/g, '.*');
    return new RegExp('^' + regexPattern + '$', 'i').test(path);
  }

  function getQueryParamsFromUrl(url) {
    try {
      const params = {};
      new URL(url).searchParams.forEach((value, key) => {
        params[key] = value;
      });
      return params;
    } catch (e) {
      return {};
    }
  }

  function queryParamsMatch(filter, urlParams) {
    for (const [key, expectedValue] of Object.entries(filter)) {
      const actualValue = urlParams[key];
      if (actualValue === undefined) return false;
      if (expectedValue === '*') continue;
      if (typeof expectedValue === 'string' && expectedValue.includes('*')) {
        if (!patternMatches(expectedValue, String(actualValue))) return false;
      } else if (String(actualValue) !== String(expectedValue)) {
        return false;
      }
    }
    return true;
  }

  function getRequestBodyString(requestData) {
    const body = requestData.body || requestData.variables;
    if (body == null) return '';
    if (typeof body === 'string') return body;
    try {
      return JSON.stringify(body);
    } catch (e) {
      return String(body);
    }
  }

  function bodyPatternMatches(pattern, bodyString) {
    if (!pattern || !bodyString) return false;
    try {
      return new RegExp(pattern, 'i').test(bodyString);
    } catch (e) {
      return bodyString.toLowerCase().includes(String(pattern).toLowerCase());
    }
  }

  function urlPatternMatches(pattern, url) {
    const trimmedPattern = String(pattern).trim();
    if (trimmedPattern.startsWith('/') && trimmedPattern.endsWith('/')) {
      try {
        return new RegExp(trimmedPattern.slice(1, -1)).test(url);
      } catch (e) {
        return false;
      }
    }
    if (trimmedPattern.includes('*')) {
      const regexPattern = trimmedPattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      try {
        return new RegExp(regexPattern, 'i').test(url);
      } catch (e) {
        return false;
      }
    }
    if (/[.*+?^${}()|[\]\\]/.test(trimmedPattern)) {
      try {
        return new RegExp(trimmedPattern).test(url);
      } catch (e) {
        /* fall through */
      }
    }
    return url.toLowerCase().includes(trimmedPattern.toLowerCase());
  }

  function ruleMatches(rule, requestData, url, requestType) {
    const ruleRequestType = rule.requestType || 'graphql';
    if (ruleRequestType !== 'both' && ruleRequestType !== requestType) {
      return false;
    }

    if (requestType === 'graphql' && (ruleRequestType === 'graphql' || ruleRequestType === 'both')) {
      if (rule.operationName && requestData.operationName) {
        if (!patternMatches(rule.operationName, requestData.operationName)) return false;
      } else if (rule.operationName && !requestData.operationName) {
        return false;
      }
      if (rule.graphqlEndpoint) {
        const urlPath = getUrlPath(url);
        if (!patternMatches(rule.graphqlEndpoint, urlPath)) return false;
      }
    }

    if (requestType === 'rest' && (ruleRequestType === 'rest' || ruleRequestType === 'both')) {
      if (rule.httpMethod && rule.httpMethod !== 'ALL') {
        if (requestData.method && rule.httpMethod !== requestData.method) {
          return false;
        }
      }
      if (rule.restPath) {
        const urlPath = getUrlPath(url);
        if (!pathPatternMatches(rule.restPath, urlPath)) return false;
      }
      if (rule.restEndpoint) {
        const endpoint = getEndpointFromUrl(url);
        if (!patternMatches(rule.restEndpoint, endpoint)) return false;
      }
      if (rule.queryFilter && Object.keys(rule.queryFilter).length > 0) {
        const urlParams = getQueryParamsFromUrl(url);
        if (!queryParamsMatch(rule.queryFilter, urlParams)) return false;
      }
      if (rule.bodyPattern) {
        const requestBody = getRequestBodyString(requestData);
        if (!bodyPatternMatches(rule.bodyPattern, requestBody)) return false;
      }
    }

    if (rule.urlPattern) {
      if (!urlPatternMatches(rule.urlPattern, url)) return false;
    }

    return true;
  }

  function escapeRegex(s) {
    return String(s).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Host + optional port for redirect regex / DNR (handles full URL, host/path, plain host, *.wild).
   */
  function hostPatternToRegexHostPart(hostPat) {
    const p = String(hostPat || '').trim();
    if (!p) return null;
    if (p.includes('://')) {
      try {
        return escapeRegex(new URL(p).host);
      } catch (e) {
        return null;
      }
    }
    if (!p.includes('/') && !p.includes('*')) {
      return escapeRegex(p);
    }
    if (p.includes('*') && !p.includes('/')) {
      return p
        .split(/\*+/g)
        .map(escapeRegex)
        .join('.*');
    }
    try {
      return escapeRegex(new URL('https://' + p.replace(/^\/+/, '')).host);
    } catch (e) {
      return p
        .split(/\*+/g)
        .map(escapeRegex)
        .join('.*');
    }
  }

  /**
   * Valid WebExtension match-pattern hosts are a plain hostname, `*`, or `*.domain...` only.
   * Patterns like `modernxl-cas-*.pearson.com` cannot be expressed; blocking must use `&lt;all_urls&gt;`.
   */
  function firefoxHostNeedsAllUrlsBlocking(hostPat) {
    const p = String(hostPat || '').trim();
    if (!p.includes('*')) {
      return false;
    }
    if (p === '*') {
      return false;
    }
    if (p.startsWith('*.')) {
      return p.slice(2).includes('*');
    }
    return true;
  }

  /**
   * Firefox webRequest blocking `urls`: one or more `*://host/*` patterns, or `<all_urls>` when host cannot be derived.
   */
  function extractFirefoxBlockingUrlPatterns(urlPatternRaw) {
    const p = String(urlPatternRaw || '').trim();
    if (!p) {
      return { useAllUrls: false, patterns: [] };
    }
    if (p.startsWith('/') && p.endsWith('/') && p.length > 2) {
      return { useAllUrls: true, patterns: [] };
    }
    if (p.includes('://')) {
      try {
        const h = new URL(p).hostname;
        if (!h) {
          return { useAllUrls: true, patterns: [] };
        }
        if (firefoxHostNeedsAllUrlsBlocking(h)) {
          return { useAllUrls: true, patterns: [] };
        }
        return { useAllUrls: false, patterns: [`*://${h}/*`] };
      } catch (e) {
        return { useAllUrls: true, patterns: [] };
      }
    }
    if (p.includes('*') && p.includes('/')) {
      return { useAllUrls: true, patterns: [] };
    }
    if (!p.includes('/')) {
      if (/^[\w*.-]+$/.test(p)) {
        if (firefoxHostNeedsAllUrlsBlocking(p)) {
          return { useAllUrls: true, patterns: [] };
        }
        return { useAllUrls: false, patterns: [`*://${p}/*`] };
      }
      return { useAllUrls: true, patterns: [] };
    }
    try {
      const h = new URL('https://' + p.replace(/^\/+/, '')).hostname;
      return { useAllUrls: false, patterns: h ? [`*://${h}/*`] : [] };
    } catch (e) {
      return { useAllUrls: true, patterns: [] };
    }
  }

  /**
   * Directory prefix for filename-only redirects (see redirectFilenameOnly), derived from restPath.
   * Trailing `*` is stripped; an exact file path yields its parent directory.
   */
  function restPathToEscapedDirPrefix(pathPat) {
    const raw = String(pathPat || '').trim();
    if (!raw) {
      return '';
    }
    let p = raw.startsWith('/') ? raw : '/' + raw;
    if (p.endsWith('*')) {
      p = p.replace(/\*+$/, '').replace(/\/*$/, '');
    } else {
      const lastSlash = p.lastIndexOf('/');
      if (lastSlash > 0) {
        p = p.slice(0, lastSlash);
      } else {
        p = '';
      }
    }
    if (!p || p === '/') {
      return '';
    }
    const segments = p.split('/').filter(Boolean).map(escapeRegex);
    return '/' + segments.join('/') + '/';
  }

  /** Chrome DNR: redirect to `origin/<filename><query>#hash` (declarativeNetRequest regexSubstitution). */
  function buildChromeFilenameOnlyRedirect(rule) {
    const target = (rule.redirectUrl || '').trim();
    const urlPat = (rule.urlPattern || '').trim();
    if (!target || !urlPat) {
      return null;
    }
    let origin;
    try {
      origin = new URL(target).origin;
    } catch (e) {
      return null;
    }
    const hostRe = hostPatternToRegexHostPart(urlPat);
    if (!hostRe) {
      return null;
    }
    const pathPat = (rule.restPath || '').trim();
    const endpoint = (rule.restEndpoint || '').trim();
    const escapedPrefix = restPathToEscapedDirPrefix(pathPat);
    const fileRe =
      endpoint && String(endpoint).trim() && String(endpoint).trim() !== '*'
        ? endpointPatternToRegex(endpoint)
        : '[^/?#]+';
    let regexFilter;
    if (escapedPrefix) {
      regexFilter =
        '^https?://' +
        hostRe +
        '(?::\\d+)?' +
        escapedPrefix +
        '((?:[^/]+/)*)(' +
        fileRe +
        ')(\\?[^#]*)?(#.*)?$';
    } else {
      regexFilter =
        '^https?://' +
        hostRe +
        '(?::\\d+)?/((?:[^/]+/)*)(' +
        fileRe +
        ')(\\?[^#]*)?(#.*)?$';
    }
    return {
      regexFilter,
      redirect: { regexSubstitution: origin + '/\\2\\3\\4' }
    };
  }

  /**
   * Chrome DNR redirect: static url, or regexSubstitution when preservePath + host-only rule (script src parity).
   */
  function buildChromeDeclarativeRedirect(rule) {
    const target = (rule.redirectUrl || '').trim();
    const urlPat = (rule.urlPattern || '').trim();
    if (!target || !urlPat) {
      return null;
    }
    const pathPat = (rule.restPath || '').trim();
    const endpoint = (rule.restEndpoint || '').trim();
    const hasPathConstraint = !!(pathPat || endpoint);
    const hostRe = hostPatternToRegexHostPart(urlPat);
    if (!hostRe) {
      return null;
    }

    if (rule.redirectFilenameOnly) {
      const fo = buildChromeFilenameOnlyRedirect(rule);
      if (fo) {
        return fo;
      }
    }

    if (rule.redirectPreservePath && !hasPathConstraint) {
      let origin;
      try {
        origin = new URL(target).origin;
      } catch (e) {
        return null;
      }
      const regexFilter = '^https?://' + hostRe + '(?::\\d+)?(.*)$';
      return {
        regexFilter,
        redirect: { regexSubstitution: origin + '\\1' }
      };
    }

    const regexFilter = buildRedirectRegexFilter(rule);
    if (!regexFilter) {
      return null;
    }
    return {
      regexFilter,
      redirect: { url: target }
    };
  }

  function pathPatternToRegexBody(pathPattern) {
    return String(pathPattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:\w+/g, '[^/]+')
      .replace(/\*/g, '.*');
  }

  function endpointPatternToRegex(endpointPattern) {
    return String(endpointPattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
  }

  /**
   * Build a regexFilter for declarativeNetRequest REDIRECT (Chrome).
   * Requires Host/Domain pattern for safety when path is broad.
   */
  function buildRedirectRegexFilter(rule) {
    const hostPat = (rule.urlPattern || '').trim();
    const pathPat = (rule.restPath || '').trim();
    const endpoint = (rule.restEndpoint || '').trim();

    if (!hostPat) {
      return null;
    }

    const hostRe = hostPatternToRegexHostPart(hostPat);
    if (!hostRe) {
      return null;
    }

    if (!pathPat && !endpoint) {
      return (
        '^https?://' +
        hostRe +
        '(?::\\d+)?(?:/.*)?(?:\\?[^#]*)?(?:#.*)?$'
      );
    }

    let pathRe;
    if (pathPat) {
      pathRe = pathPatternToRegexBody(pathPat);
      if (!pathRe.startsWith('/')) pathRe = '/' + pathRe;
    } else {
      pathRe = '/.*';
    }

    const pathNeedsEndpoint = endpoint && pathPat && /[*]|:+\w+/.test(pathPat);
    const pathAlreadyHasExactEnd =
      endpoint && pathPat && !pathPat.includes('*') && !/:+\w+/.test(pathPat) && pathPat.endsWith(endpoint);

    if (endpoint && pathNeedsEndpoint && !pathAlreadyHasExactEnd) {
      const epRe = endpointPatternToRegex(endpoint);
      pathRe = pathRe.replace(/\$$/, '') + '/' + epRe + '$';
    } else if (!pathRe.endsWith('$')) {
      pathRe += '$';
    }

    return '^https?://' + hostRe + pathRe + '(?:\\?[^#]*)?$';
  }

  /**
   * Final redirect URL for webRequest blocking / fetch override.
   * When redirectPreservePath is false, copies the source query onto the target if the target URL has none.
   */
  function buildRedirectDestination(rule, sourceUrl) {
    const base = (rule.redirectUrl || '').trim();
    if (!base) return null;
    try {
      const src = new URL(sourceUrl);
      if (rule.redirectFilenameOnly) {
        const segments = src.pathname.split('/').filter(Boolean);
        const filename = segments[segments.length - 1] || '';
        if (!filename) {
          return null;
        }
        const b = new URL(base);
        return (
          b.origin.replace(/\/$/, '') +
          '/' +
          filename +
          src.search +
          (src.hash || '')
        );
      }
      if (rule.redirectPreservePath) {
        return new URL(src.pathname + src.search + src.hash, base).href;
      }
      const b = new URL(base);
      let out = b.origin + b.pathname;
      if (b.search) {
        out += b.search;
      } else if (src.search) {
        out += src.search;
      }
      if (src.hash && !out.includes('#')) {
        out += src.hash;
      }
      return out;
    } catch (e) {
      return base;
    }
  }

  return {
    ruleMatches,
    buildRedirectRegexFilter,
    buildChromeDeclarativeRedirect,
    buildRedirectDestination,
    extractFirefoxBlockingUrlPatterns,
    hostPatternToRegexHostPart,
    getUrlPath,
    getEndpointFromUrl,
    patternMatches,
    pathPatternMatches,
    urlPatternMatches
  };
})();
