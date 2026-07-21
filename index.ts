import { sequelize as sequelizeConfig } from './config/database.js';
import { app } from './app.js';

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

sequelizeConfig
  .authenticate()
  .then(() => console.log('Database connection has been established successfully.'))
  .catch((err) => console.error('Unable to connect to the database:', err));

app.listen(Number(port), host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
