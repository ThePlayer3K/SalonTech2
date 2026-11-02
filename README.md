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

O front antigo permanece em `/legacy` apenas como referência. Autenticação e dashboard usam sessões server-side.

## Despesas

Administradores e master podem acessar `/despesas` para cadastrar, consultar, editar e excluir despesas com descrição, valor, tipo (`fixo` ou `variavel`) e data. A pesquisa aceita parte do nome/descrição sem diferenciar maiúsculas e minúsculas, data inicial, data final ou a combinação dos campos. Os limites do período são inclusivos; também é possível informar apenas uma das datas.

Execute `npm run db:schema` para adicionar a coluna `tipo` e o índice de data em bancos existentes. As despesas anteriores são classificadas inicialmente como variáveis e podem ser reclassificadas pela edição. A descrição utiliza a coluna `nome` já existente no banco. O tipo fixo identifica a despesa; não gera lançamentos recorrentes automaticamente.

Para executar os testes automatizados: `node --test`.

Mensagem de commit sugerida: `feat: migrate supabase schema to render postgres`.
