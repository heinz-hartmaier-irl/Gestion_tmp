import mysql from 'mysql2/promise';

let connection: mysql.Connection | null = null;

export const getDBConnection = async () => {
  if (!connection) {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || "4000"), // TiDB utilise souvent le port 4000
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      },
      connectTimeout: 20000 
    });
  }
  return connection;
};