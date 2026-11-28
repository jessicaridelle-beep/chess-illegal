// A presentation barrier, independent of chess engine strength and bot delay.
export function actionHold(fx,{effects=true,reduced=false}={}){
  if(!effects||reduced||!fx)return 0
  return fx.capture||fx.power||fx.promotion?1250:1050
}
export function delayForPresentation(now,until,base=0){
  return Math.max(base,until>now?until-now+30:0)
}
export function extendPresentation(now,until,duration){
  return duration>0?Math.max(until,now+duration):until
}
export function preparedRatingMatches(prepared,search){
  return !!prepared&&!!search&&prepared.fen===search.fen&&prepared.played===search.played&&!!prepared.grade
}
