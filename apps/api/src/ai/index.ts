export interface AiAnalyst { answer(question:string,context:{tenantId:string;metrics:Record<string,unknown>}):Promise<{answer:string;citations:string[]}>; }
export interface AiRecommendation { type:string; rationale:string; proposedAction:Record<string,unknown>; requiresApproval:true; }
export interface AiRecommendationEngine { recommend(context:Record<string,unknown>):Promise<AiRecommendation[]>; }
/** AI remains advisory and approval-gated. No provider is coupled to the domain. */
