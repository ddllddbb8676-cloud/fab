export const SPEECH_LIMIT = 20;
export const SPEECH_DURATION_MS = 8000;
const limitMessage = `${SPEECH_LIMIT}자 이내로 입력해 주세요.`;
let segmenter;

function characterCount(text) {
  if (typeof Intl.Segmenter !== 'function') return Array.from(text).length;
  segmenter ??= new Intl.Segmenter('ko', {granularity:'grapheme'});
  let length = 0;
  for (const _ of segmenter.segment(text)) length++;
  return length;
}

export function readSpeech(value) {
  if (typeof value !== 'string' || value.length > 512) return {ok:false, message:limitMessage};
  const text = value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
  const length = characterCount(text);
  if (!/[^\s\p{Cf}]/u.test(text)) return {ok:false, message:'말풍선에 띄울 내용을 입력해 주세요.', length};
  if (length > SPEECH_LIMIT) return {ok:false, message:limitMessage, length};
  return {ok:true, text, length};
}
