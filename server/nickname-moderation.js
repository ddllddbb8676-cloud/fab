import {NICKNAME_CHOICE_VERSION} from '../src/nickname-policy.js';
import {isSafety} from '../src/safety-team.js';

export async function resetInappropriateNickname({actorId,targetName,profiles,room}) {
  if(!room.players.get(actorId)?.chipUnlimited)return {ok:false,message:'운영자만 사용할 수 있어요.'};
  if(typeof targetName!=='string'||!targetName.trim()||targetName.length>32)return {ok:false,message:'변경할 닉네임을 입력해 주세요.'};
  const id=profiles.nicknameVisitorId(targetName.trim());
  if(!id?.startsWith('visitor:')||id===actorId)return {ok:false,message:'변경할 방문자 닉네임을 찾지 못했어요.'};
  const current=room.profile(id)||await profiles.get(id);if(!current)return {ok:false,message:'방문자 기록을 찾지 못했어요.'};
  const name=profiles.replacementNickname(id);
  if(room.players.has(id)) {
    if(!room.applyNickname(id,name))return {ok:false,message:'다시 시도해 주세요.'};
  } else {
    if(!profiles.replaceNickname(id,name))return {ok:false,message:'다시 시도해 주세요.'};
    profiles.save({...current,civilianName:name,name:isSafety(current.role)?current.name:name,nicknameChoiceVersion:NICKNAME_CHOICE_VERSION});
  }
  return {ok:true,name};
}
