import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react';
import type { Order } from '../../shared/types.ts';
import { formatPrice } from './api.ts';
import { gridTheme } from './grid.ts';

function StatusBadge({ data }: CustomCellRendererProps<Order>) {
  const paid = data?.status === 'paid';
  return <span className={`status ${paid ? 'status-paid' : 'status-waiting'}`}>{paid ? 'Paid' : 'Awaiting payment'}</span>;
}

export function OrdersGrid({ orders }: { orders: Order[] }) {
  const columnDefs = useMemo<ColDef<Order>[]>(
    () => [
      { field: 'number', headerName: 'Order', width: 100, cellClass: 'cell-strong' },
      {
        field: 'createdAt',
        headerName: 'Placed',
        width: 110,
        valueFormatter: (p) => new Date(p.value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      },
      { field: 'customerName', headerName: 'Customer', width: 130 },
      {
        colId: 'items',
        headerName: 'Items',
        flex: 2,
        minWidth: 220,
        valueGetter: (p) => p.data?.lines.map((line) => `${line.quantity}× ${line.name}`).join(', '),
        tooltipValueGetter: (p) => p.value,
      },
      { field: 'pickupTime', headerName: 'Pickup', flex: 1, minWidth: 130 },
      {
        field: 'total',
        width: 100,
        valueFormatter: (p) => (p.data ? formatPrice(p.value, p.data.currency) : ''),
      },
      // Flashes when a payment comes in.
      { field: 'status', width: 160, cellRenderer: StatusBadge, enableCellChangeFlash: true },
      { field: 'shopReceives', headerName: 'You receive', width: 130, valueFormatter: (p) => p.value ?? '—' },
    ],
    [],
  );

  return (
    <AgGridReact<Order>
      theme={gridTheme}
      rowData={orders}
      columnDefs={columnDefs}
      defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
      getRowId={(p) => p.data.id}
      domLayout="autoHeight"
      tooltipShowDelay={300}
      overlayNoRowsTemplate="No orders yet. Share your shop link to get your first one."
    />
  );
}
