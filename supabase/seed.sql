-- ============================================================
--  Seed Data — Neón y Sabor Mi Rancho
--  Run AFTER schema.sql
-- ============================================================

-- Categories
insert into public.categories (name, icon, display_order) values
  ('Entradas',    '🥗', 1),
  ('Antojitos',   '🌮', 2),
  ('Carnes',      '🥩', 3),
  ('Mariscos',    '🦐', 4),
  ('Pastas',      '🍝', 5),
  ('Bebidas',     '🍹', 6),
  ('Postres',     '🍮', 7);

-- Menu Items
with cats as (
  select id, name from public.categories
)
insert into public.menu_items (category_id, name, description, price, is_featured, available) values
  -- Entradas
  ((select id from cats where name='Entradas'), 'Guacamole Artesanal',    'Aguacate fresco, jitomate, cebolla, cilantro y chile serrano. Servido con totopos.',  85.00, true,  true),
  ((select id from cats where name='Entradas'), 'Sopa de Lima',           'Caldo de pollo con tortilla frita, lima y chile ancho.',                               70.00, false, true),
  ((select id from cats where name='Entradas'), 'Queso Fundido',          'Queso Oaxaca derretido con chorizo y rajas. Servido con tortillas de maíz.',          95.00, true,  true),
  -- Antojitos
  ((select id from cats where name='Antojitos'), 'Tacos de Birria (3)',   'Res estilo Jalisco con consomé, cebolla y cilantro.',                                 120.00, true,  true),
  ((select id from cats where name='Antojitos'), 'Enchiladas Verdes',     'Tres enchiladas rellenas de pollo, salsa verde, crema y queso.',                       90.00, false, true),
  ((select id from cats where name='Antojitos'), 'Tostadas de Tinga',     'Dos tostadas con tinga de pollo, lechuga, crema y queso.',                            75.00, false, true),
  -- Carnes
  ((select id from cats where name='Carnes'), 'Arrachera a la Parrilla', '300g de arrachera marinada con guarnición de nopales y elote.',                       195.00, true,  true),
  ((select id from cats where name='Carnes'), 'Costillas BBQ Rancheras', 'Costillas de cerdo glaseadas con salsa BBQ de la casa, papas rústicas.',              220.00, true,  true),
  ((select id from cats where name='Carnes'), 'Pollo al Ajillo',         'Pechuga de pollo salteada con ajo, limón y hierbas finas.',                           145.00, false, true),
  -- Mariscos
  ((select id from cats where name='Mariscos'), 'Ceviche de Camarón',    'Camarón fresco marinado en limón, jitomate, pepino y cebolla morada.',                130.00, true,  true),
  ((select id from cats where name='Mariscos'), 'Filete de Mojarra',     'Mojarra entera frita o a la plancha con ensalada y arroz.',                           160.00, false, true),
  -- Pastas
  ((select id from cats where name='Pastas'), 'Fettuccine Alfredo',      'Pasta en salsa de crema, mantequilla y queso parmesano.',                             110.00, false, true),
  ((select id from cats where name='Pastas'), 'Penne Arrabiata',         'Pasta en salsa de jitomate picante con albahaca fresca.',                              95.00, false, true),
  -- Bebidas
  ((select id from cats where name='Bebidas'), 'Agua Fresca del Día',    'Horchata, Jamaica o Tamarindo. 1 litro.',                                              35.00, false, true),
  ((select id from cats where name='Bebidas'), 'Margarita Clásica',      'Tequila, triple sec y jugo de limón. Con o sin sal.',                                 95.00, true,  true),
  ((select id from cats where name='Bebidas'), 'Limonada con Chía',      'Limonada natural con semillas de chía y menta.',                                       40.00, false, true),
  ((select id from cats where name='Bebidas'), 'Cerveza Nacional',       'Modelo, Corona o Pacifico.',                                                           55.00, false, true),
  -- Postres
  ((select id from cats where name='Postres'), 'Flan Napolitano',        'Flan casero con caramelo y crema batida.',                                             65.00, true,  true),
  ((select id from cats where name='Postres'), 'Churros con Cajeta',     'Churros recién hechos con cajeta y chocolate caliente.',                               70.00, false, true),
  ((select id from cats where name='Postres'), 'Pay de Queso',           'Cheesecake con coulis de frutos rojos.',                                               75.00, false, true);

-- Restaurant Tables
insert into public.restaurant_tables (number, capacity, location) values
  (1,  2, 'interior'),
  (2,  2, 'interior'),
  (3,  4, 'interior'),
  (4,  4, 'interior'),
  (5,  4, 'interior'),
  (6,  6, 'interior'),
  (7,  6, 'terraza'),
  (8,  4, 'terraza'),
  (9,  4, 'terraza'),
  (10, 8, 'terraza'),
  (11, 2, 'barra'),
  (12, 2, 'barra'),
  (13, 10,'privado');
