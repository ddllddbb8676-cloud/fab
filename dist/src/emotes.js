export const EMOTES = [
  {id:'wave',emoji:'👋',label:'인사'}, {id:'laugh',emoji:'😂',label:'웃음'},
  {id:'cry',emoji:'😭',label:'울음'}, {id:'angry',emoji:'😡',label:'화남'},
  {id:'surprise',emoji:'😱',label:'깜짝'}, {id:'heart',emoji:'❤️',label:'하트'},
  {id:'thumbs-up',emoji:'👍',label:'최고'}, {id:'clap',emoji:'👏',label:'박수'},
  {id:'plead',emoji:'🥺',label:'부탁'}, {id:'cool',emoji:'😎',label:'으쓱'},
  {id:'excited',emoji:'😆',label:'신남'}, {id:'grin',emoji:'😁',label:'활짝'},
  {id:'sleepy',emoji:'😪',label:'졸려'}, {id:'no',emoji:'❌',label:'안 돼'},
  {id:'ghost',emoji:'👻',label:'유령'}, {id:'sleep',emoji:'💤',label:'쿨쿨'},
  {id:'think',emoji:'🤔',label:'고민'},
  {id:'question',emoji:'❓',label:'물음표'}, {id:'love',emoji:'🥰',label:'사랑해'},
  {id:'pray',emoji:'🙏',label:'고마워'}, {id:'steam',emoji:'😤',label:'흥'},
  {id:'distorted',emoji:'🫪',label:'당황'}, {id:'ogre',emoji:'👹',label:'버럭'},
  {id:'asleep',emoji:'😴',label:'잠듦'}, {id:'yawn',emoji:'🥱',label:'하품'},
  {id:'party',emoji:'🥳',label:'축하'}, {id:'awkward',emoji:'😅',label:'머쓱'},
  {id:'shy',emoji:'😳',label:'부끄러워'}, {id:'sad',emoji:'😔',label:'시무룩'},
  {id:'unimpressed',emoji:'😑',label:'무표정'}, {id:'quiet',emoji:'🤫',label:'쉿'}
];
// Older IDs remain valid for already-open clients. The picker is curated:
// exactly three rows of nine, with the user's chosen first row preserved.
const menuIds=[
  'wave','excited','heart','cry','surprise','ghost','thumbs-up','angry','cool',
  'grin','party','clap','pray','plead','awkward','shy','sad','unimpressed',
  'think','question','distorted','steam','ogre','no','quiet','yawn','asleep'
];
export const EMOTE_MENU=menuIds.map(id=>EMOTES.find(emote=>emote.id===id));
export const EMOTE_SECONDS = 3;
export const isEmote = id => EMOTES.some(emote => emote.id === id);
// One font-independent silhouette for both the small button and head bubble.
export const HEART_PATH='M64 105 C57 98 20 74 20 47 C20 20 50 17 64 38 C78 17 108 20 108 47 C108 74 71 98 64 105 Z';
export const HEART_COLOR='#ed425b';
