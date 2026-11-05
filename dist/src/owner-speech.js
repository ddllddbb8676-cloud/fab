export const SPEECH_LIMIT = 60;
export const SPEECH_DURATION_MS = 8000;

export function readSpeech(value) {
  if (typeof value !== 'string' || value.length > 512) return {ok:false, message:'60자 이내로 입력해 주세요.'};
  const text = value.normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u202a-\u202e\u2066-\u2069\ufeff]/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
  const length = Array.from(text).length;
  if (!/[^\s\p{Cf}]/u.test(text)) return {ok:false, message:'말풍선에 띄울 내용을 입력해 주세요.', length};
  if (length > SPEECH_LIMIT) return {ok:false, message:'60자 이내로 입력해 주세요.', length};
  return {ok:true, text, length};
}
