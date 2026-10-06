export interface DeliveryProvider { readonly name:string; createJob(input:{orderId:string;pickup:unknown;dropoff:unknown;idempotencyKey:string}):Promise<{providerJobId:string;trackingReference?:string}>; cancelJob(providerJobId:string):Promise<void>; }
export class DeliveryProviderNotConfigured extends Error { constructor(){super("No delivery provider is configured.");} }
