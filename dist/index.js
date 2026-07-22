import { serve } from '@hono/node-server';
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => {
    return c.text('Hello Hono!');
});
serve({
    fetch: app.fetch,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
