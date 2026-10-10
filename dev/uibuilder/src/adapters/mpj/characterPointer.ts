import { CharSelectState, PAD, RANDOM, type CharSelectConfig } from "@app/scene/menu/charselect/state";
/** Pointer input is translated to the shortest sequence of real web-state directional inputs. */
export function characterPointerPath(state:CharSelectState,target:number,pid:number,config:CharSelectConfig):number[] {
 if(state.phase!==1 || state.players[pid]?.decided || target<0 || target>RANDOM || !Number.isInteger(target))return [];
 if(state.players.some(p=>p.pid!==pid && p.cursor===target) || state.isDisabled(target))return [];
 const from=state.players[pid].cursor,queue:{at:number;path:number[]}[]=[{at:from,path:[]}],seen=new Set([from]);
 while(queue.length){const {at,path}=queue.shift()!;if(at===target)return path;
  for(const direction of [PAD.LEFT,PAD.RIGHT,PAD.UP,PAD.DOWN]) {
   const clone=new CharSelectState({...config,players:state.players.map(p=>({type:p.type,initial:p.pid===pid?at:p.cursor}))});clone.start(true);
   clone.step(state.players.map(p=>({trig:p.pid===pid?direction:0,rep:0})));const next=clone.players[pid].cursor;
   if(!seen.has(next)){seen.add(next);queue.push({at:next,path:[...path,direction]});}
  }
 }
 return [];
}
