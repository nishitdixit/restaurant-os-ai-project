# Inventory Strategy

## MVP

Inventory is intentionally limited to availability controls:

- in stock;
- out of stock;
- manual temporary pause;
- optional opening/closing schedule later.

## V1/V2 direction

Introduce stock items and recipe/BOM relationships.

Example:

`Chicken Biryani -> 250g chicken + rice + spices + packaging`

Then derive estimated sellable portions.

## Important distinction

Stock quantity is not the same as product availability. A product can be unavailable for reasons other than raw stock.

## Future inventory entities

- InventoryItem
- StockLedgerEntry
- Recipe
- RecipeComponent
- WasteRecord
- PurchaseOrder
- Supplier
- GoodsReceipt
- StockTransfer

## Accounting-like behavior

Prefer append-only stock movements over silently changing quantity. This enables audit and reconciliation later.

## Automatic availability

Future rule:

`available_quantity < threshold -> alert`

`estimated_portions == 0 -> disable sale`

Automation must be configurable and reversible.
