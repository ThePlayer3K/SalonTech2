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

O schema em [`schema.sql`](schema.sql) foi convertido do export do Supabase para PostgreSQL/Render. O comando `npm run db:schema` aplica o schema e as atualizações em `migrations/` na mesma transação. Para atualizar um banco já configurado, execute `npm run db:migrate`.

O front antigo permanece em `/legacy` apenas como referência. Autenticação e dashboard usam sessões server-side.

## Despesas

Administradores e master podem acessar `/despesas` para cadastrar, consultar, editar e excluir despesas com descrição, valor, tipo (`fixo` ou `variavel`) e data. A pesquisa aceita parte do nome/descrição sem diferenciar maiúsculas e minúsculas, data inicial, data final ou a combinação dos campos. Os limites do período são inclusivos; também é possível informar apenas uma das datas.

Execute `npm run db:schema` para adicionar a coluna `tipo` e o índice de data em bancos existentes. As despesas anteriores são classificadas inicialmente como variáveis e podem ser reclassificadas pela edição. A descrição utiliza a coluna `nome` já existente no banco. O tipo fixo identifica a despesa; não gera lançamentos recorrentes automaticamente.

Para executar os testes automatizados: `node --test`.

O cadastro usa um identificador único por formulário e uma restrição de unicidade no banco para impedir duplicações por cliques ou reenvios simultâneos. O botão também fica desabilitado durante o envio. Um novo formulário permite cadastrar outra despesa com os mesmos dados intencionalmente.

## Agendamentos

Em `/agendamentos`, selecione cliente, serviço, data e hora, forma de pagamento e situação: Agendado, Pago, Concluído ou Cancelado. Administradores e master gerenciam toda a agenda; profissionais consultam e gerenciam somente seus atendimentos, usando seus serviços. Todos os campos são obrigatórios e as opções vêm do banco.

Agendamentos podem ser cadastrados, consultados e editados, mas nunca excluídos. Para liberar um horário, use Cancelado. O banco também bloqueia `DELETE` e `TRUNCATE` da tabela de agendamentos.

O período reservado vai do início até o início mais a duração do serviço em minutos. Dois atendimentos do mesmo profissional não podem se sobrepor, mesmo quando duas requisições chegam simultaneamente. Horários consecutivos e profissionais diferentes são permitidos. Somente cancelados deixam de reservar o horário; a reativação também verifica conflitos. Um conflito retorna HTTP 409 sem alterar o agendamento nem sua comissão.

O agendamento preserva profissional, duração, valor e percentual de comissão do serviço contratado. Trocar o serviço atualiza esses dados; mudanças posteriores no catálogo não alteram atendimentos já contratados. Datas e horas são tratadas como horário local do salão, sem conversão de fuso.

Marcar Pago cria uma despesa variável com descrição `Comissão de (nome do profissional)`, valor `valor contratado × percentual / 100`, arredondado em centavos, e data do atendimento. Repetir Pago mantém uma única comissão. Trocar serviço ou data de um agendamento pago sincroniza a despesa. Qualquer saída de Pago, inclusive para Concluído, remove somente a comissão vinculada. As alterações são atômicas no banco. Comissões automáticas são gerenciadas pelo agendamento e não podem ser editadas ou excluídas manualmente na tela de despesas.

A migration `migrations/002-agendamentos.sql` adiciona as colunas, índices, restrições de conflito e gatilhos. Pode ser reaplicada com `npm run db:migrate`. Caso existam agendamentos legados sem campos obrigatórios ou com sobreposições, corrija esses registros antes de executar a migration; uma falha reverte toda a atualização.

Os testes de PostgreSQL usam um schema temporário isolado, removido ao final. Para executá-los, configure `TEST_DATABASE_URL` (e `TEST_DB_SSL=true`, se necessário) e rode `node --test tests/agendamentos-db.test.js`. Eles verificam comissões, reversões, bloqueio de exclusão, permissões e cadastros concorrentes, sem inserir dados nas tabelas da aplicação.
