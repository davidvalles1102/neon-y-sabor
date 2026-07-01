-- ============================================================
--  Seed de producción — Neón y Sabor Mi Rancho
--  Compatible con el schema real (categories.slug como PK)
--  Seguro de ejecutar: usa ON CONFLICT DO UPDATE / DO NOTHING
--  Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- ─── CATEGORÍAS ──────────────────────────────────────────────
INSERT INTO public.categories (slug, name, icon, display_order, active) VALUES
  ('desayunos',           'Desayunos',            '🍳', 1, true),
  ('almuerzos',           'Almuerzos',            '🍲', 2, true),
  ('almuerzos_a_la_carta','Almuerzos a la Carta', '🍽️', 3, true),
  ('bebidas',             'Bebidas',              '🥤', 4, true),
  ('comidas_rapidas',     'Comidas Rápidas',      '🍔', 5, true),
  ('bebidas_bar',         'Bebidas Bar',          '🍻', 6, true)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  icon          = EXCLUDED.icon,
  display_order = EXCLUDED.display_order,
  active        = EXCLUDED.active;

-- ─── PLATILLOS ───────────────────────────────────────────────
INSERT INTO public.menu_items (category_id, name, description, price, is_featured, available) VALUES

  -- Desayunos
  ('desayunos', 'Desayuno Ejecutivo',
   'Huevos al gusto (pericos / revueltos / fritos / pericos rancheros) + acompañamiento a elección (arepa / pan / patacones / arroz). Adición de frutas y queso disponible.',
   12000, true, true),
  ('desayunos', 'Desayuno Corriente',
   'Caldo del día + proteína a elección (carne asada / pechuga / cerdo / huevos sudados / chorizo).',
   10000, false, true),
  ('desayunos', 'Desayuno Especial',
   'Desayuno completo con huevos al gusto, calentado, arepa, jugo y bebida caliente.',
   12000, false, true),

  -- Almuerzos
  ('almuerzos', 'Almuerzo Corriente',
   'Sopa del día, principio del día, arroz, proteína y ensalada.',
   13000, true, true),
  ('almuerzos', 'Carne en viste',
   'Almuerzo corriente con carne en viste, arroz, sopa del día y jugo.',
   13000, false, true),

  -- Almuerzos a la Carta
  ('almuerzos_a_la_carta', 'Carne a la plancha',
   'Carne de res asada a la plancha, acompañada de arroz, ensalada y patacones.',
   15000, false, true),
  ('almuerzos_a_la_carta', 'Carne ahumada',
   'Carne de res ahumada lentamente, servida con guarnición tradicional.',
   18000, false, true),
  ('almuerzos_a_la_carta', 'Costilla ahumada',
   'Costilla de cerdo ahumada al estilo de la casa.',
   18000, true,  true),
  ('almuerzos_a_la_carta', 'Tilapia ahumada',
   'Tilapia entera ahumada.',
   18000, false, true),
  ('almuerzos_a_la_carta', 'Bandeja paisa mini',
   'Frijoles, chicharrón, carne, chorizo, morcilla, huevo, arroz, arepa y tajada.',
   20000, true,  true),
  ('almuerzos_a_la_carta', 'Costilla BBQ',
   'Costilla de cerdo en salsa BBQ de la casa.',
   15000, false, true),
  ('almuerzos_a_la_carta', 'Alitas BBQ',
   'Alitas de pollo en salsa BBQ.',
   15000, true,  true),
  ('almuerzos_a_la_carta', 'Sancocho de gallina de campo',
   'Sancocho tradicional de gallina criolla.',
   25000, true,  true),
  ('almuerzos_a_la_carta', 'Sancocho gallina piqui mocha',
   'Sancocho especial de gallina piqui mocha.',
   15000, false, true),
  ('almuerzos_a_la_carta', 'Ajiaco',
   'Ajiaco bogotano con pollo, papas y guascas.',
   14000, false, true),
  ('almuerzos_a_la_carta', 'Trucha',
   'Trucha a la plancha con guarnición.',
   18000, false, true),
  ('almuerzos_a_la_carta', 'Filete de tilapia',
   'Filete de tilapia a la plancha.',
   18000, false, true),
  ('almuerzos_a_la_carta', 'Pescado de río',
   'Pescado de río fresco del día.',
   18000, false, true),
  ('almuerzos_a_la_carta', 'Pechuga gratinada',
   'Pechuga de pollo gratinada con queso, acompañada de arroz y ensalada.',
   15000, false, true),
  ('almuerzos_a_la_carta', 'Pechuga rellena',
   'Pechuga de pollo rellena con verduras y queso, acompañada de arroz y ensalada.',
   15000, false, true),

  -- Bebidas
  ('bebidas', 'Jugo de naranja',  'Jugo natural de naranja.',          5000, false, true),
  ('bebidas', 'Gaseosas',         'Surtido de gaseosas.',              3000, false, true),
  ('bebidas', 'Coca-Cola',        'Coca-Cola en lata o botella.',      3000, false, true),
  ('bebidas', 'Limonada natural', 'Limonada natural con o sin azúcar.',5000, false, true),
  ('bebidas', 'Chocolate',        'Chocolate caliente con leche.',     4000, false, true),
  ('bebidas', 'Café en leche',    'Café colombiano con leche caliente.',4000, false, true),
  ('bebidas', 'Tinto',            'Tinto colombiano.',                  2000, false, true),
  ('bebidas', 'Jugos naturales',  'Jugos de frutas de temporada.',     5000, false, true),
  ('bebidas', 'Agua natural',     'Agua en botella.',                  2000, false, true),

  -- Comidas Rápidas
  ('comidas_rapidas', 'Salchipapa',               'Papas fritas con salchichas y salsas.',             8000, false, true),
  ('comidas_rapidas', 'Picadas',                  'Selección de carnes y acompañamientos para compartir.',12000, true, true),
  ('comidas_rapidas', 'Pataconazo',               'Patacón con hogao y guarnición.',                  10000, false, true),
  ('comidas_rapidas', 'Hamburguesas',             'Hamburguesa artesanal de la casa.',                12000, true,  true),
  ('comidas_rapidas', 'Arepa de choclo con queso','Arepa de choclo dulce con queso blanco derretido.', 6000, false, true),
  ('comidas_rapidas', 'Arepa rellena',            'Arepa rellena con queso y carnes.',                 8000, false, true),
  ('comidas_rapidas', 'Alitas BBQ',               'Alitas de pollo en salsa BBQ.',                   15000, true,  true),
  ('comidas_rapidas', 'Picadas de pollo',         'Pollo apanado o a la plancha en trozos.',         12000, false, true),
  ('comidas_rapidas', 'Pechuga a la plancha',     'Pechuga de pollo a la plancha con guarnición.',   12000, false, true),
  ('comidas_rapidas', 'Pinchos de cerdo y pollo', 'Pinchos a la parrilla de cerdo y pollo.',         10000, false, true),

  -- Bebidas Bar
  ('bebidas_bar', 'Michelada sin alcohol', 'Michelada de limón sin alcohol.',  8000, false, true),
  ('bebidas_bar', 'Michelada con alcohol', 'Michelada con cerveza.',           12000, true,  true),
  ('bebidas_bar', 'Cócteles',             'Cócteles de la carta.',             15000, true,  true),
  ('bebidas_bar', 'Cubetazo',             'Cubo de cervezas surtidas.',        25000, true,  true)

ON CONFLICT DO NOTHING;

-- ─── VERIFICACIÓN ─────────────────────────────────────────────
SELECT c.name AS categoria, COUNT(m.id) AS platillos
FROM public.categories c
LEFT JOIN public.menu_items m ON m.category_id = c.slug
GROUP BY c.name, c.display_order
ORDER BY c.display_order;
