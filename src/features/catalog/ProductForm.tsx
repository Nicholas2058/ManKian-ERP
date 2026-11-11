import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ArtKey, Product, UomCode } from '@/domain/types';
import { useDbState } from '@/store/db';
import { act } from '@/lib/act';
import { createProduct, updateProduct } from '@/domain/commands/catalog';
import { UOM_LABELS } from '@/domain/uom';
import { toSen } from '@/lib/money';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/core';
import { Modal } from '@/components/ui/overlay';

const UOMS = Object.keys(UOM_LABELS) as UomCode[];
const ARTS: ArtKey[] = ['pipe', 'elbow', 'tee', 'valve', 'tank', 'anchor', 'bolt', 'ubolt', 'angle', 'beam', 'channel', 'paver', 'block', 'pad', 'geotextile', 'mesh', 'roof', 'bag', 'board', 'barrier', 'helmet', 'gloves', 'vest', 'cone', 'harness', 'netting', 'mask', 'drill', 'grinder', 'saw', 'hammer', 'spanner', 'tape', 'level', 'sealant', 'pail', 'drum', 'spray', 'cable', 'lamp', 'fan', 'socket', 'box', 'shelf', 'ladder', 'disc', 'bits', 'platform', 'lock', 'hose', 'wheelbarrow'];

const schema = z
  .object({
    sku: z.string().trim().min(3, 'SKU needs at least 3 characters').max(24).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
    name: z.string().trim().min(3, 'Name is required'),
    variantLabel: z.string().trim().optional(),
    categoryId: z.string().min(1, 'Choose a category'),
    brandId: z.string().min(1, 'Choose a brand'),
    baseUom: z.string().min(1),
    packUom: z.string().optional(),
    packFactor: z.coerce.number().optional(),
    cost: z.coerce.number().positive('Cost must be greater than 0'),
    price: z.coerce.number().positive('Price must be greater than 0'),
    leadTimeDays: z.coerce.number().int().min(0).max(120),
    reorderPoint: z.coerce.number().min(0),
    reorderQty: z.coerce.number().positive('Reorder qty must be greater than 0'),
    weightKg: z.coerce.number().min(0),
    preferredSupplierId: z.string().min(1),
    art: z.string(),
    description: z.string().optional(),
  })
  .refine((v) => !v.packUom || (v.packFactor ?? 0) > 1, { message: 'Pack factor must be more than 1 base unit', path: ['packFactor'] })
  .refine((v) => v.price >= v.cost, { message: 'List price is below cost — check the figures', path: ['price'] });

type FormV = z.input<typeof schema>;

export function ProductFormModal({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product }) {
  const db = useDbState();
  const edit = !!product;
  const pack = product?.uoms.find((u) => u.factor > 1);
  const defaults: FormV = {
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    variantLabel: product?.variantLabel ?? '',
    categoryId: product?.categoryId ?? '',
    brandId: product?.brandId ?? 'b_gen',
    baseUom: product?.baseUom ?? 'PCS',
    packUom: pack?.uom ?? '',
    packFactor: pack?.factor ?? undefined,
    cost: product ? product.cost / 100 : ('' as unknown as number),
    price: product ? product.basePrice / 100 : ('' as unknown as number),
    leadTimeDays: product?.leadTimeDays ?? 5,
    reorderPoint: product?.reorderPoint ?? 20,
    reorderQty: product?.reorderQty ?? 50,
    weightKg: product?.weightKg ?? 1,
    preferredSupplierId: product?.preferredSupplierId ?? 's1',
    art: product?.art ?? 'box',
    description: product?.description ?? '',
  };
  const { register, handleSubmit, formState, reset } = useForm<FormV>({ resolver: zodResolver(schema), defaultValues: defaults, mode: 'onBlur' });
  React.useEffect(() => {
    if (open) reset(defaults);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const e = formState.errors;
  const submit = handleSubmit((raw) => {
    const v = schema.parse(raw);
    const uoms = v.packUom ? [{ uom: v.packUom as UomCode, factor: v.packFactor! }] : [];
    const common = {
      sku: v.sku,
      name: v.name,
      variantLabel: v.variantLabel || undefined,
      categoryId: v.categoryId,
      brandId: v.brandId,
      baseUom: v.baseUom as UomCode,
      uoms,
      leadTimeDays: v.leadTimeDays,
      reorderPoint: v.reorderPoint,
      reorderQty: v.reorderQty,
      weightKg: v.weightKg,
      preferredSupplierId: v.preferredSupplierId,
      art: v.art as ArtKey,
      description: v.description ?? '',
    };
    const r = edit
      ? act(updateProduct, { productId: product!.id, patch: common }, { success: `${v.sku} updated`, undo: `edit ${v.sku}` })
      : act(createProduct, { ...common, specs: v.variantLabel ? { Size: v.variantLabel } : {}, volatility: 'low', cost: toSen(v.cost), basePrice: toSen(v.price) }, { success: `${v.sku} created` });
    if (r !== undefined) onOpenChange(false);
  });
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={edit ? `Edit ${product!.sku}` : 'Add product'}
      description={edit ? 'Cost and selling price changes go through the pricing workflow, not this form.' : 'Initial cost and list price create version 1 in the price history.'}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={formState.isSubmitting}>
            {edit ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate>
        <Field label="SKU" required error={e.sku?.message}>
          <Input {...register('sku')} disabled={edit} invalid={!!e.sku} />
        </Field>
        <Field label="Name" required error={e.name?.message} className="sm:col-span-2">
          <Input {...register('name')} invalid={!!e.name} />
        </Field>
        <Field label="Variant (size / thickness / colour)">
          <Input {...register('variantLabel')} placeholder='e.g. 2" (50 mm)' />
        </Field>
        <Field label="Category" required error={e.categoryId?.message}>
          <Select {...register('categoryId')}>
            <option value="">Select…</option>
            {Object.values(db.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Brand" required error={e.brandId?.message}>
          <Select {...register('brandId')}>
            {Object.values(db.brands).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base UOM" required hint="Stock is held in this unit">
          <Select {...register('baseUom')}>
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u} — {UOM_LABELS[u]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Pack UOM (optional)">
          <Select {...register('packUom')}>
            <option value="">None</option>
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Base units per pack" error={e.packFactor?.message} hint="Product-specific, never assumed">
          <Input type="number" {...register('packFactor')} invalid={!!e.packFactor} />
        </Field>
        {!edit && (
          <>
            <Field label="Cost per base unit (RM)" required error={e.cost?.message}>
              <Input type="number" step="0.01" {...register('cost')} invalid={!!e.cost} />
            </Field>
            <Field label="List price per base unit (RM)" required error={e.price?.message}>
              <Input type="number" step="0.05" {...register('price')} invalid={!!e.price} />
            </Field>
          </>
        )}
        <Field label="Preferred supplier">
          <Select {...register('preferredSupplierId')}>
            {Object.values(db.suppliers).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Lead time (days)" error={e.leadTimeDays?.message}>
          <Input type="number" {...register('leadTimeDays')} />
        </Field>
        <Field label="Reorder point" error={e.reorderPoint?.message}>
          <Input type="number" {...register('reorderPoint')} />
        </Field>
        <Field label="Reorder qty" error={e.reorderQty?.message}>
          <Input type="number" {...register('reorderQty')} />
        </Field>
        <Field label="Weight per base unit (kg)">
          <Input type="number" step="0.01" {...register('weightKg')} />
        </Field>
        <Field label="Illustration">
          <Select {...register('art')}>
            {ARTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-3">
          <Textarea {...register('description')} className="min-h-[60px]" />
        </Field>
      </form>
    </Modal>
  );
}
