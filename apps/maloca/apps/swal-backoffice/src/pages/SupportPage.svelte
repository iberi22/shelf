<script lang="ts">
  import { malocaClient, type SupportTicket, type AppSupportMetrics } from '../lib/malocaClient.svelte';

  export let currentAppId: string = 'shelf-inventory';

  let selectedAppId: string = currentAppId;
  let tickets: SupportTicket[] = [];
  let metrics: AppSupportMetrics | null = null;

  $: {
    if (selectedAppId) {
      loadAppSupportData(selectedAppId);
    }
  }

  async function loadAppSupportData(appId: string) {
    malocaClient.setAppId(appId);
    tickets = await malocaClient.getTicketsByApp(appId);
    metrics = await malocaClient.getAppSupportMetrics(appId);
  }
</script>

<div class="support-page p-6">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold">App Support Portal</h1>

    <!-- App Filter Selector -->
    <div class="flex items-center space-x-2">
      <label for="app-filter" class="text-sm font-medium">Application:</label>
      <select
        id="app-filter"
        bind:value={selectedAppId}
        class="app-selector px-4 py-2 border rounded-lg bg-surface text-foreground"
      >
        <option value="shelf-inventory">Shelf Inventory</option>
        <option value="maloca-salud">Maloca Salud</option>
        <option value="maloca-veeduria">Maloca Veeduria</option>
      </select>
    </div>
  </header>

  <!-- Support Metrics per App -->
  {#if metrics}
    <div class="metrics-grid grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div class="card p-4 rounded-lg bg-surface border border-border">
        <span class="text-sm text-muted">Total Tickets ({metrics.app_id})</span>
        <p class="text-2xl font-bold" data-testid="metric-total">{metrics.total_tickets}</p>
      </div>
      <div class="card p-4 rounded-lg bg-surface border border-border">
        <span class="text-sm text-muted">Open Tickets</span>
        <p class="text-2xl font-bold text-amber-500" data-testid="metric-open">{metrics.open_tickets}</p>
      </div>
      <div class="card p-4 rounded-lg bg-surface border border-border">
        <span class="text-sm text-muted">In Progress</span>
        <p class="text-2xl font-bold text-blue-500" data-testid="metric-in-progress">{metrics.in_progress_tickets}</p>
      </div>
      <div class="card p-4 rounded-lg bg-surface border border-border">
        <span class="text-sm text-muted">Resolved</span>
        <p class="text-2xl font-bold text-emerald-500" data-testid="metric-resolved">{metrics.resolved_tickets}</p>
      </div>
    </div>
  {/if}

  <!-- Isolated Ticket List -->
  <div class="ticket-list space-y-3">
    {#if tickets.length === 0}
      <div class="empty-state p-8 text-center border rounded-lg text-muted">
        No support tickets found for app: {selectedAppId}.
      </div>
    {:else}
      {#each tickets as ticket (ticket.id)}
        <div class="ticket-item p-4 border rounded-lg flex justify-between items-center bg-surface">
          <div>
            <span class="badge text-xs px-2 py-1 bg-muted rounded font-mono">{ticket.app_id}</span>
            <h3 class="font-semibold text-lg inline ml-2">{ticket.title}</h3>
            <p class="text-sm text-muted mt-1">{ticket.description}</p>
          </div>
          <div class="flex items-center space-x-2">
            <span class="priority-badge text-xs px-2 py-1 rounded font-bold uppercase priority-{ticket.priority}">
              {ticket.priority}
            </span>
            <span class="status-badge text-xs px-2 py-1 rounded font-bold uppercase status-{ticket.status}">
              {ticket.status}
            </span>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
