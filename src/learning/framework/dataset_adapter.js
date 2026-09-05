export class SkillDatasetAdapter{
  constructor({id,label,version=1}={}){if(!id)throw new Error('dataset_adapter_id_required');this.id=id;this.label=label||id;this.version=version}
  supports(){return false}
  getSources(){return[]}
  describe(skillId){return{id:this.id,label:this.label,version:this.version,sources:this.getSources(skillId)}}
  async buildTrainingDataset(){throw new Error(`dataset_build_not_supported:${this.id}`)}
  async importDataset(){throw new Error(`dataset_import_not_supported:${this.id}`)}
  exportDataset(){throw new Error(`dataset_export_not_supported:${this.id}`)}
}
