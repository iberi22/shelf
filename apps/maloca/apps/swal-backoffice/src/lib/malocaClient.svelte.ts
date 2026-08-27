export interface SupportTicket {
  id: string;
  app_id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppSupportMetrics {
  app_id: string;
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
}

export class MalocaClient {
  private currentAppId: string;
  private tickets: SupportTicket[] = [];

  constructor(appId: string = 'shelf-inventory') {
    this.currentAppId = appId;
  }

  public setAppId(appId: string): void {
    this.currentAppId = appId;
  }

  public getAppId(): string {
    return this.currentAppId;
  }

  public async fetchSupportTickets(): Promise<SupportTicket[]> {
    return [...this.tickets];
  }

  public async getTicketsByApp(appId: string = this.currentAppId): Promise<SupportTicket[]> {
    const allTickets = await this.fetchSupportTickets();
    return allTickets.filter((ticket) => ticket.app_id === appId);
  }

  public async getAppSupportMetrics(appId: string = this.currentAppId): Promise<AppSupportMetrics> {
    const appTickets = await this.getTicketsByApp(appId);
    return {
      app_id: appId,
      total_tickets: appTickets.length,
      open_tickets: appTickets.filter((t) => t.status === 'open').length,
      in_progress_tickets: appTickets.filter((t) => t.status === 'in_progress').length,
      resolved_tickets: appTickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
    };
  }

  public async createTicket(
    ticketData: Omit<SupportTicket, 'id' | 'app_id' | 'created_at' | 'updated_at'>
  ): Promise<SupportTicket> {
    const newTicket: SupportTicket = {
      ...ticketData,
      id: crypto.randomUUID(),
      app_id: this.currentAppId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.tickets.push(newTicket);
    return newTicket;
  }
}

export const malocaClient = new MalocaClient();
