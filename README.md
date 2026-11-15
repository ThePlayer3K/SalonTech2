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

## Máscaras dos formulários

Os formulários de criação e edição compartilham as máscaras em `public/js/form-masks.js`: CPF (`000.000.000-00`), telefone fixo/celular com DDD, valores monetários em reais (`1.234,56`), comissão com até duas casas decimais e números inteiros para estoque e duração. As máscaras monetárias abrangem serviços, despesas e salários; os limites de valor e comissão são verificados durante o preenchimento, junto das validações do servidor.

Na digitação de valores monetários, os dígitos preenchem os centavos (digitar `20000` resulta em `200,00`). Ao abrir uma edição ou colar um valor no campo vazio/inteiramente selecionado, o valor é interpretado em reais: `200`, `200.00` e `200,00` resultam em `200,00`. A edição preserva a posição do cursor e a restauração de um formulário mantém os valores salvos.

Datas e horários usam os controles nativos do navegador nos agendamentos e nos filtros de despesas/finanças. E-mail usa o campo nativo com validação de formato. Nomes, descrições, categorias, usuários e senhas permitem texto livre conforme os limites de cada cadastro.

## Despesas

Administradores e master podem acessar `/despesas` para cadastrar, consultar, editar e excluir despesas com descrição, valor, tipo (`fixo` ou `variavel`) e data. A pesquisa aceita parte do nome/descrição sem diferenciar maiúsculas e minúsculas, data inicial, data final ou a combinação dos campos. Os limites do período são inclusivos; também é possível informar apenas uma das datas.

Execute `npm run db:schema` para configurar o banco novo, ou `npm run db:migrate` para atualizar um banco já configurado. As despesas anteriores sem tipo são classificadas inicialmente como variáveis e podem ser reclassificadas pela edição. A descrição utiliza a coluna `nome` já existente no banco.

Despesas fixas geram um lançamento mensal a partir do mês seguinte à data informada. Por exemplo, uma despesa com data de 5 de novembro gera a próxima em 5 de dezembro. O dia é sempre baseado no cadastro original: uma despesa de 31 de janeiro vence em 28/29 de fevereiro e volta ao dia 31 em março. Despesas futuras não geram cópias antes do vencimento.

A rotina roda ao iniciar o servidor e a cada minuto, no fuso `America/Sao_Paulo`. As consultas de despesas e de finanças também executam a rotina antes de buscar os dados. Quando o servidor volta após um período desligado, recupera todos os meses pendentes até a data atual, sem antecipar lançamentos pelo período escolhido no relatório. Se o serviço de hospedagem estiver suspenso, os lançamentos são recuperados na próxima inicialização ou consulta.

Edite o cadastro original para mudar descrição, valor ou dia dos próximos lançamentos. Alterar seu tipo para variável ou excluir o original encerra a geração, preservando as cópias anteriores. Ao reativar uma despesa variável como fixa, a recorrência recomeça no mês seguinte ao atual (ou ao mês da data informada, caso seja futura); não recupera meses desativados. Editar ou excluir uma cópia afeta somente aquele lançamento: não abre outra série e não recria uma cópia removida.

A migration `migrations/003-financas.sql` registra também as despesas fixas já existentes. O cursor mensal, a restrição de unicidade por série/competência e os bloqueios transacionais impedem duplicações entre requisições e servidores concorrentes. Reaplicar a migration preserva os cursores.

## Finanças

Administradores e master acessam `/financas`. O período padrão vai do primeiro dia do mês até hoje, no horário do salão. O formulário permite selecionar outro período; as duas datas são inclusivas, incluindo todos os horários do último dia.

O relatório mostra entradas, despesas e caixa líquido (`entradas − despesas`), entradas agrupadas por serviço, todos os lançamentos de despesas com data e tipo/origem, e receitas agrupadas por forma de pagamento. Períodos vazios exibem zero e mensagens próprias; o saldo recebe destaque conforme positivo ou negativo.

Cada vencimento de uma despesa fixa aparece como uma linha independente, com sua data, em todos os meses abrangidos pelo período desde o cadastro. Uma conta de água de R$ 200 com vencimentos em 05/11 e 05/12 aparece duas vezes ao selecionar novembro e dezembro e soma R$ 400 às despesas. Vencimentos posteriores ao último mês gerado são calculados para o relatório e identificados como `Fixa prevista`; também entram no total de despesas e no caixa líquido. A consulta não grava esses lançamentos antecipadamente. Quando a rotina mensal os registra, passam a aparecer como lançamentos automáticos, sem duplicação. Cópias editadas mantêm seus valores/datas reais, cópias excluídas não reaparecem como previsões e séries encerradas não geram previsões.

Somente agendamentos na situação `pago` compõem as entradas, pela data do atendimento e pelo `valor_total` contratado, preservado no agendamento. Agendados, concluídos e cancelados não entram. A divisão por pagamento usa a forma de pagamento do agendamento. As comissões já registradas automaticamente contam nas despesas uma única vez, junto das despesas manuais e fixas geradas. Todos os cálculos de totais usam `NUMERIC` no PostgreSQL, e listas e totais são obtidos no mesmo snapshot.

Para executar os testes automatizados: `node --test`.

O cadastro usa um identificador único por formulário e uma restrição de unicidade no banco para impedir duplicações por cliques ou reenvios simultâneos. O botão também fica desabilitado durante o envio. Um novo formulário permite cadastrar outra despesa com os mesmos dados intencionalmente.

## Agendamentos

Em `/agendamentos`, selecione cliente, serviço, data e hora, forma de pagamento e situação: Agendado, Pago, Concluído ou Cancelado. Administradores e master gerenciam toda a agenda; profissionais consultam e gerenciam somente seus atendimentos, usando seus serviços. Todos os campos são obrigatórios e as opções vêm do banco.

Agendamentos podem ser cadastrados, consultados e editados, mas nunca excluídos. Para liberar um horário, use Cancelado. O banco também bloqueia `DELETE` e `TRUNCATE` da tabela de agendamentos.

O período reservado vai do início até o início mais a duração do serviço em minutos. Dois atendimentos do mesmo profissional não podem se sobrepor, mesmo quando duas requisições chegam simultaneamente. Horários consecutivos e profissionais diferentes são permitidos. Somente cancelados deixam de reservar o horário; a reativação também verifica conflitos. Um conflito retorna HTTP 409 sem alterar o agendamento nem sua comissão.

O agendamento preserva profissional, duração, valor e percentual de comissão do serviço contratado. Trocar o serviço atualiza esses dados; mudanças posteriores no catálogo não alteram atendimentos já contratados. Datas e horas são tratadas como horário local do salão, sem conversão de fuso.

Marcar Pago cria uma despesa variável com descrição `Comissão de (nome do profissional)`, valor `valor contratado × percentual / 100`, arredondado em centavos, e data do atendimento. Repetir Pago mantém uma única comissão. Trocar serviço ou data de um agendamento pago sincroniza a despesa. Qualquer saída de Pago, inclusive para Concluído, remove somente a comissão vinculada. As alterações são atômicas no banco. Comissões automáticas são gerenciadas pelo agendamento e não podem ser editadas ou excluídas manualmente na tela de despesas.

A migration `migrations/002-agendamentos.sql` adiciona as colunas, índices, restrições de conflito e gatilhos. Pode ser reaplicada com `npm run db:migrate`. Caso existam agendamentos legados sem campos obrigatórios ou com sobreposições, corrija esses registros antes de executar a migration; uma falha reverte toda a atualização.

Os testes de PostgreSQL usam schemas temporários isolados, removidos ao final. Para executá-los, configure `TEST_DATABASE_URL` (e `TEST_DB_SSL=true`, se necessário) e rode `node --test tests/agendamentos-db.test.js tests/financas-db.test.js`. Eles verificam comissões, reversões, bloqueio de exclusão, permissões, cadastros concorrentes, totais financeiros, recorrências, meses curtos, anos bissextos e recuperação de meses pendentes, sem inserir dados nas tabelas da aplicação. Sem `TEST_DATABASE_URL`, esses testes são ignorados; os demais testes executam normalmente.
