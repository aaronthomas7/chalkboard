import { useMemo, useRef, type RefObject } from 'react';
import type { CellClassParams, CellValueChangedEvent, ColDef, ITooltipParams } from 'ag-grid-community';
import { AgGridReact, type CustomCellRendererProps } from 'ag-grid-react';
import type { MenuItem } from '../../shared/types.ts';
import { formatPrice } from './api.ts';
import { gridTheme } from './grid.ts';

type Props = {
  items: MenuItem[];
  currency: string;
  onChange: (items: MenuItem[]) => void;
};

type Latest = RefObject<Props>;

// Highlights a cell the AI flagged as a guess and shows its reason on hover.
function flagged(field: string): Partial<ColDef<MenuItem>> {
  return {
    cellClassRules: {
      'cell-unsure': (p: CellClassParams<MenuItem>) => Boolean(p.data?.unsure.includes(field)),
    },
    tooltipValueGetter: (p: ITooltipParams<MenuItem>) =>
      p.data?.unsure.includes(field) ? p.data.note || 'Please check this' : undefined,
  };
}

function RemoveButton({ data, context }: CustomCellRendererProps<MenuItem, unknown, Latest>) {
  return (
    <button
      type="button"
      className="grid-remove"
      aria-label={`Remove ${data?.name || 'item'}`}
      onClick={() => {
        const { items, onChange } = context.current;
        onChange(items.filter((item) => item.id !== data?.id));
      }}
    >
      ×
    </button>
  );
}

export function MenuGrid(props: Props) {
  // The grid keeps its own copy of callbacks, so read the latest props through a ref.
  const latest = useRef(props);
  latest.current = props;
  const { items, currency } = props;

  const columnDefs = useMemo<ColDef<MenuItem>[]>(
    () => [
      { field: 'available', headerName: 'On sale', width: 92, cellDataType: 'boolean' },
      { field: 'name', headerName: 'Item', flex: 2, minWidth: 180, ...flagged('name') },
      { field: 'category', flex: 1, minWidth: 120, ...flagged('category') },
      {
        field: 'price',
        width: 110,
        cellDataType: 'number',
        valueFormatter: (p) => (p.value ? formatPrice(p.value, currency) : '—'),
        ...flagged('price'),
      },
      { field: 'description', flex: 2, minWidth: 160, ...flagged('description') },
      {
        colId: 'tags',
        headerName: 'Tags',
        flex: 1,
        minWidth: 120,
        valueGetter: (p) => p.data?.tags.join(', '),
        valueSetter: (p) => {
          p.data.tags = String(p.newValue ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
          return true;
        },
      },
      { colId: 'remove', headerName: '', width: 56, editable: false, cellRenderer: RemoveButton },
    ],
    [currency],
  );

  function handleChange(event: CellValueChangedEvent<MenuItem>) {
    // Editing a flagged cell counts as the owner confirming it.
    const field = event.colDef.field ?? event.colDef.colId;
    const { items, onChange } = latest.current;
    onChange(
      items.map((item) =>
        item.id === event.data.id
          ? { ...event.data, unsure: event.data.unsure.filter((f) => f !== field) }
          : item,
      ),
    );
  }

  return (
    <AgGridReact<MenuItem>
      theme={gridTheme}
      rowData={items}
      columnDefs={columnDefs}
      defaultColDef={{ editable: true, sortable: false, resizable: true, suppressMovable: true }}
      getRowId={(p) => p.data.id}
      context={latest}
      domLayout="autoHeight"
      singleClickEdit
      stopEditingWhenCellsLoseFocus
      tooltipShowDelay={150}
      onCellValueChanged={handleChange}
    />
  );
}
