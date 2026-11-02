export const NICKNAME_WARNING='욕설 등 적절하지 못한 닉네임이 확인되면 예고 없이 삭제됩니다.';
export const NICKNAME_CHOICE_VERSION=1;
export const NICKNAME_TICKET_PRICE=1000;
export function checkNickname(value) {
  if(typeof value!=='string')return {ok:false,message:'닉네임을 입력해 주세요.'};
  const name=value.normalize('NFC').trim().replace(/ +/g,' ');
  if(!name||[...name].length>7)return {ok:false,message:'닉네임은 공백 포함 1~7자로 입력해 주세요.'};
  if(!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 ]+$/u.test(name))return {ok:false,message:'한글·영문·숫자와 띄어쓰기만 사용할 수 있어요.'};
  if(name.replace(/ /g,'').normalize('NFKC').includes('세미'))return {ok:false,message:'“세미”가 포함된 닉네임은 사용할 수 없어요.'};
  return {ok:true,name};
}
