import { APIInterceptor } from '../src/content/interceptor';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  main() {
    new APIInterceptor();
  },
});
