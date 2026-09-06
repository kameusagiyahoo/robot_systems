export class RobotInterface{
  connect(){throw new Error('not implemented')}
  getObservation(){throw new Error('not implemented')}
  // Implementations may return a plain result or a Promise. Policy/Environment callers must await it.
  sendAction(_action){throw new Error('not implemented')}
  disconnect(){throw new Error('not implemented')}
}
