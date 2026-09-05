const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export class RulePlanner{
  parseTask(taskText){
    const text=taskText.trim();
    let source='pallet_A';
    if(/B|Ｂ|パレットB/i.test(text)) source='pallet_B';
    if(/A|Ａ|パレットA/i.test(text)) source='pallet_A';

    let destination='shipping';
    if(/棚2|棚２|storage\s*b|保管B/i.test(text)) destination='storage_B';
    else if(/棚1|棚１|storage\s*a|保管A/i.test(text)) destination='storage_A';
    else if(/出荷|shipping/i.test(text)) destination='shipping';

    return {raw:text,source,destination,status:'active'};
  }

  next(task,state){
    const pallet=state.pallets[task.source];
    const destination=state.locations[task.destination];
    const robot=state.robot;
    if(!pallet) return {type:'abort',reason:'pallet_not_found'};
    if(!destination) return {type:'abort',reason:'destination_not_found'};

    if(state.agent.memory.retreated && !robot.carrying && pallet.status==='placed'){
      return {type:'done',reason:'task_complete'};
    }

    if(robot.carrying===task.source){
      if(!robot.forkRaised) return {type:'skill',skill:{name:'lift',args:{}}};
      if(distance(robot,destination)>95) return {type:'skill',skill:{name:'navigate_to',args:{locationId:task.destination}}};
      return {type:'skill',skill:{name:'place',args:{locationId:task.destination}}};
    }

    if(pallet.status==='placed'){
      return {type:'skill',skill:{name:'retreat',args:{}}};
    }

    if(distance(robot,pallet)>180) return {type:'skill',skill:{name:'navigate_to_pallet',args:{palletId:task.source}}};
    if(!state.perception.detectedPallets.includes(task.source)) return {type:'skill',skill:{name:'detect_pallet',args:{palletId:task.source}}};
    if(!robot.aligned) return {type:'skill',skill:{name:'align_to_pallet',args:{palletId:task.source}}};
    return {type:'skill',skill:{name:'insert_forks',args:{palletId:task.source}}};
  }
}
