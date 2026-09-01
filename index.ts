import { sequelize as sequelizeConfig } from './config/database.js';
import { app } from './app.js';

// Never start a production deploy that would serve every request unauthenticated.
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.SUPABASE_URL &&
  process.env.AUTH_DISABLED !== 'true'
) {
  console.error(
    'Refusing to start in production without SUPABASE_URL. ' +
      'Set SUPABASE_URL, or set AUTH_DISABLED=true to run without auth on purpose.',
  );
  process.exit(1);
}

const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

sequelizeConfig
  .authenticate()
  .then(() => console.log('Database connection has been established successfully.'))
  .catch((err) => console.error('Unable to connect to the database:', err));

app.listen(Number(port), host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
