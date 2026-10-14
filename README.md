# SalonTech

Aplicação server-side do sistema interno do salão, usando Node.js, Express, EJS e PostgreSQL.

## Rodar localmente

1. Instale as dependências: `npm install`.
2. Copie `.env.example` para `.env` e preencha a URL do PostgreSQL.
3. Aplique o schema convertido: `npm run db:schema`.
4. Crie o primeiro administrador: `npm run seed:admin`.
5. Inicie em desenvolvimento: `npm run dev` ou `npm start`.

O login usa `ADMIN_NAME` como usuário e `ADMIN_PASSWORD` como senha. Como o schema original não possui e-mail em `usuario`, a aplicação autentica pelo campo `usuario.nome`. Os cargos são `A` para administrador e `F` para profissional.

## Render

Use um Web Service Node com Build Command `npm install` e Start Command `npm start`. Configure `DATABASE_URL` com a Internal Database URL do PostgreSQL e `DB_SSL=true`. Para executar o schema na sua máquina, use a External Database URL.

O schema em [`schema.sql`](schema.sql) foi convertido do export do Supabase: não contém `CREATE DATABASE`, `USE`, `AUTO_INCREMENT` ou sintaxe específica de MySQL, e pode ser executado diretamente no banco PostgreSQL do Render.

O front antigo permanece em `/legacy` apenas como referência. As telas de negócio atuais são placeholders; autenticação e dashboard usam sessões server-side.

Mensagem de commit sugerida: `feat: migrate supabase schema to render postgres`.
