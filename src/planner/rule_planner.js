const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export class RulePlanner{
  parseTask(taskText){
    const text=taskText.trim();
    let source=null;
    if(/B|Ｂ|パレットB/i.test(text)) source='pallet_B';
    if(/A|Ａ|パレットA/i.test(text)) source='pallet_A';
    let destination=null;
    if(/棚2|棚２|storage\s*b|保管B/i.test(text)) destination='storage_B';
    else if(/棚1|棚１|storage\s*a|保管A/i.test(text)) destination='storage_A';
    else if(/出荷|shipping/i.test(text)) destination='shipping';
    return {raw:text,source,destination,status:(text&&source&&destination)?'active':'invalid'};
  }

  recovery(state){
    const result=state.agent.lastResult;
    if(!result||result.ok)return null;
    const failed=state.agent.memory.lastFailedSkill;
    const retries=state.agent.memory.retries[failed]||0;
    const reason=result.reason||'';
    if(reason==='path_blocked'){
      if(!state.agent.memory.alternateRoute)return{type:'skill',recovery:true,skill:{name:'avoid_obstacle',args:{}}};
      return{type:'abort',reason:'path_blocked_after_alternate_route'};
    }
    if(reason.includes('detection')||reason==='pallet_not_visible'){
      if(retries<=2)return{type:'skill',recovery:true,skill:{name:'reposition_for_detection',args:{}}};
      return{type:'abort',reason:'detection_failed_after_retries'};
    }
    if(reason.includes('alignment')){
      if(retries<=1)return{type:'skill',recovery:true,skill:{name:'align_to_pallet',args:{palletId:state.task.source}}};
      return{type:'abort',reason:'alignment_failed_after_retry'};
    }
    if(reason.includes('insertion')){
      if(retries<=1)return{type:'skill',recovery:true,skill:{name:'align_to_pallet',args:{palletId:state.task.source}}};
      return{type:'abort',reason:'insertion_failed_after_retry'};
    }
    if(reason.startsWith('precondition_failed:'))return{type:'abort',reason};
    return{type:'abort',reason:`unrecoverable:${reason}`};
  }

  next(task,state){
    if(task.status==='invalid'||!task.source||!task.destination)return{type:'abort',reason:'invalid_task'};
    const recovery=this.recovery(state); if(recovery)return recovery;
    const pallet=state.pallets[task.source],destination=state.locations[task.destination],robot=state.robot;
    if(!pallet)return{type:'abort',reason:'pallet_not_found'};
    if(!destination)return{type:'abort',reason:'destination_not_found'};
    if(state.agent.memory.retreated&&!robot.carrying&&pallet.status==='placed')return{type:'done',reason:'task_complete'};
    if(robot.carrying===task.source){
      if(!robot.forkRaised)return{type:'skill',skill:{name:'lift',args:{}}};
      if(distance(robot,destination)>95)return{type:'skill',skill:{name:'navigate_to',args:{locationId:task.destination}}};
      return{type:'skill',skill:{name:'place',args:{locationId:task.destination}}};
    }
    if(pallet.status==='placed')return{type:'skill',skill:{name:'retreat',args:{}}};
    if(distance(robot,pallet)>180)return{type:'skill',skill:{name:'navigate_to_pallet',args:{palletId:task.source}}};
    if(!state.perception.detectedPallets.includes(task.source))return{type:'skill',skill:{name:'detect_pallet',args:{palletId:task.source}}};
    if(!robot.aligned)return{type:'skill',skill:{name:'align_to_pallet',args:{palletId:task.source}}};
    return{type:'skill',skill:{name:'insert_forks',args:{palletId:task.source}}};
  }
}
