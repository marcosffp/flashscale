import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Produto } from '../produtos/entities/produto.entity';
import { Pedido } from '../pedidos/entities/pedido.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'flashscale',
  password: process.env.DB_PASSWORD ?? 'flashscale',
  database: process.env.DB_NAME ?? 'flashscale',
  entities: [Produto, Pedido],
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  synchronize: false,
  logging: false,
  // §7.5 negocio.md: atrás do PgBouncer em transaction pooling, a conexão
  // pode ser reaproveitada por outra transação entre uma query e outra —
  // prepared statements nomeados ficam presos à conexão física errada e
  // quebram de forma intermitente sob carga. `prepare: false` desliga isso.
  // `max: 5` é o pool por pod (8 réplicas × 5 = 40 conexões no PgBouncer).
  extra: {
    max: 5,
    prepare: false,
  },
};

const AppDataSource = new DataSource(dataSourceOptions);

export default AppDataSource;
