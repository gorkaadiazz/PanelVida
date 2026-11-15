-- ---------------------------------------------------------------------------
-- Efectivo o tarjeta en los movimientos y los fijos
--
-- `medio`: con qué se paga o se cobra. Vale para gastos E ingresos (una paga
-- en mano es efectivo; una nómina, tarjeta/cuenta).
-- Por defecto 'tarjeta': las filas que ya había y lo que suba la app sin
-- actualizar (que no manda `medio`) quedan como tarjeta.
-- ---------------------------------------------------------------------------

alter table public.movimientos
  add column medio text not null default 'tarjeta'
    constraint movimientos_medio_valido check (medio in ('efectivo', 'tarjeta'));

alter table public.movimientos_fijos
  add column medio text not null default 'tarjeta'
    constraint movimientos_fijos_medio_valido check (medio in ('efectivo', 'tarjeta'));
