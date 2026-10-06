export interface BillingProvider { readonly name:string; createCustomer(input:{tenantId:string;name:string}):Promise<{providerCustomerId:string}>; createSubscription(input:{tenantId:string;providerCustomerId:string;planCode:string}):Promise<{providerSubscriptionId:string}>; }
export class BillingProviderNotConfigured extends Error { constructor(){super("No billing provider is configured.");} }
