export const bindings = {
 forward:['Вперёд','KeyW'],back:['Назад','KeyS'],left:['Влево','KeyA'],right:['Вправо','KeyD'],
 sprint:['Бег','ShiftLeft'],jump:['Прыжок','Space'],interact:['Взаимодействие','KeyE'],
 pause:['Пауза','Escape'],journal:['Журнал','KeyJ'],hint:['Подсказка','KeyH'],
 microphone:['Микрофон','KeyM'],gestures:['Жесты','KeyG'],view:['Смена камеры','KeyV'],
 travel:['Щиток портала','KeyR'],'circuit-check':['Проверка головоломки','KeyF'],
 confirm:['Подтвердить','Enter'],
 ...Object.fromEntries(Array.from({length:9},(_,i)=>['choice'+(i+1),['Вариант '+(i+1),'Digit'+(i+1)]])),
};
export const defaults = Object.fromEntries(Object.entries(bindings).map(([action,[,key]])=>[action,key]));
const storageKey='timeless-keybindings';
export function loadBindings(){
 try{
  const saved=JSON.parse(localStorage.getItem(storageKey));
  if(saved&&Object.keys(defaults).every(action=>typeof saved[action]==='string')&&
    new Set(Object.keys(defaults).map(action=>saved[action])).size===Object.keys(defaults).length)
   return Object.fromEntries(Object.keys(defaults).map(action=>[action,saved[action]]));
 }catch{}
 return {...defaults};
}
export function saveBindings(keys){localStorage.setItem(storageKey,JSON.stringify(keys));}
export function keyLabel(code){
 return ({Space:'Пробел',ShiftLeft:'Левый Shift',ShiftRight:'Правый Shift',Escape:'Esc'})[code]||
  code.replace(/^(Key|Digit)/,'').replace(/^Arrow/,'Стрелка ');
}
export function canBind(event){
 return !event.metaKey&&!event.ctrlKey&&!event.altKey&&
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Shift(Left|Right)|Tab|Backspace)$/.test(event.code)&&event.code!=='Tab';
}
