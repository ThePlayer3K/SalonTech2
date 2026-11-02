-- Executada em transação pelo aplicador de migrations.
ALTER TABLE public.despesa ADD COLUMN IF NOT EXISTS cadastro_token UUID;
CREATE UNIQUE INDEX IF NOT EXISTS despesa_cadastro_token_key ON public.despesa (cadastro_token);
-- A descrição automática inclui o prefixo e o nome completo do profissional.
ALTER TABLE public.despesa ALTER COLUMN nome TYPE VARCHAR(160);

ALTER TABLE public.agendamento ADD COLUMN IF NOT EXISTS cadastro_token UUID;
ALTER TABLE public.agendamento ADD COLUMN IF NOT EXISTS funcionario_id INTEGER REFERENCES public.funcionario(id);
ALTER TABLE public.agendamento ADD COLUMN IF NOT EXISTS duracao INTEGER;
ALTER TABLE public.agendamento ADD COLUMN IF NOT EXISTS percentual_comissao NUMERIC(5, 2);
CREATE UNIQUE INDEX IF NOT EXISTS agendamento_cadastro_token_key ON public.agendamento (cadastro_token);

-- Preserva no agendamento as condições do serviço contratado.
UPDATE public.agendamento a
   SET funcionario_id = s.funcionario_id, duracao = s.duracao,
       percentual_comissao = s.percentual_comissao, valor_total = COALESCE(a.valor_total, s.valor)
  FROM public.servico s
 WHERE a.servico_id = s.id AND a.funcionario_id IS NULL;

ALTER TABLE public.agendamento ALTER COLUMN funcionario_id SET NOT NULL;
ALTER TABLE public.agendamento ALTER COLUMN duracao SET NOT NULL;
ALTER TABLE public.agendamento ALTER COLUMN percentual_comissao SET NOT NULL;
ALTER TABLE public.agendamento ALTER COLUMN cliente_id SET NOT NULL;
ALTER TABLE public.agendamento ALTER COLUMN forma_pag_id SET NOT NULL;
ALTER TABLE public.agendamento ALTER COLUMN situacao SET NOT NULL;
ALTER TABLE public.agendamento ALTER COLUMN valor_total SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamento_dados_check' AND conrelid = 'public.agendamento'::regclass) THEN
    ALTER TABLE public.agendamento ADD CONSTRAINT agendamento_dados_check
      CHECK (situacao IN ('agendado', 'pago', 'concluido', 'cancelado')
        AND duracao > 0 AND valor_total >= 0 AND percentual_comissao BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agendamento_sem_sobreposicao' AND conrelid = 'public.agendamento'::regclass) THEN
    -- Os dois ranges usam operadores GiST nativos, sem exigir extensões.
    -- O intervalo [início, fim) permite iniciar exatamente ao fim do anterior.
    ALTER TABLE public.agendamento ADD CONSTRAINT agendamento_sem_sobreposicao
      EXCLUDE USING gist (
        int8range(funcionario_id::bigint, funcionario_id::bigint, '[]') WITH &&,
        tsrange(data_hora, data_hora + duracao * interval '1 minute', '[)') WITH &&
      ) WHERE (situacao <> 'cancelado');
  END IF;
END $$;

ALTER TABLE public.despesa ADD COLUMN IF NOT EXISTS agendamento_id INTEGER REFERENCES public.agendamento(id);
CREATE UNIQUE INDEX IF NOT EXISTS despesa_agendamento_id_key ON public.despesa (agendamento_id);

CREATE OR REPLACE FUNCTION public.preparar_agendamento() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  contratado public.servico%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.servico_id IS DISTINCT FROM OLD.servico_id THEN
    SELECT * INTO contratado FROM public.servico WHERE id = NEW.servico_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Serviço não encontrado.' USING ERRCODE = '23503';
    END IF;
    IF contratado.duracao IS NULL OR contratado.duracao <= 0 THEN
      RAISE EXCEPTION 'O serviço precisa ter uma duração válida em minutos.' USING ERRCODE = '23514';
    END IF;
    NEW.funcionario_id := contratado.funcionario_id;
    NEW.duracao := contratado.duracao;
    NEW.valor_total := contratado.valor;
    NEW.percentual_comissao := contratado.percentual_comissao;
  ELSE
    NEW.funcionario_id := OLD.funcionario_id;
    NEW.duracao := OLD.duracao;
    NEW.valor_total := OLD.valor_total;
    NEW.percentual_comissao := OLD.percentual_comissao;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS preparar_agendamento ON public.agendamento;
CREATE TRIGGER preparar_agendamento BEFORE INSERT OR UPDATE ON public.agendamento
  FOR EACH ROW EXECUTE FUNCTION public.preparar_agendamento();

CREATE OR REPLACE FUNCTION public.sincronizar_comissao_agendamento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.situacao = 'pago' THEN
    INSERT INTO public.despesa (nome, valor, tipo, data, agendamento_id)
    SELECT 'Comissão de ' || f.nome, round(NEW.valor_total * NEW.percentual_comissao / 100, 2),
           'variavel', NEW.data_hora::date, NEW.id
      FROM public.funcionario f WHERE f.id = NEW.funcionario_id
    ON CONFLICT (agendamento_id) DO UPDATE
      SET nome = EXCLUDED.nome, valor = EXCLUDED.valor, tipo = EXCLUDED.tipo, data = EXCLUDED.data;
  ELSE
    DELETE FROM public.despesa WHERE agendamento_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sincronizar_comissao_agendamento ON public.agendamento;
CREATE TRIGGER sincronizar_comissao_agendamento AFTER INSERT OR UPDATE ON public.agendamento
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_comissao_agendamento();

CREATE OR REPLACE FUNCTION public.proteger_comissao_agendamento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() = 1 THEN
    IF (TG_OP <> 'INSERT' AND OLD.agendamento_id IS NOT NULL)
       OR (TG_OP <> 'DELETE' AND NEW.agendamento_id IS NOT NULL) THEN
      RAISE EXCEPTION 'A comissão automática deve ser alterada pela situação do agendamento.'
        USING ERRCODE = '23514', CONSTRAINT = 'despesa_comissao_automatica';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteger_comissao_agendamento ON public.despesa;
CREATE TRIGGER proteger_comissao_agendamento BEFORE INSERT OR UPDATE OR DELETE ON public.despesa
  FOR EACH ROW EXECUTE FUNCTION public.proteger_comissao_agendamento();

CREATE OR REPLACE FUNCTION public.impedir_remocao_agendamento() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Agendamentos são irremovíveis. Altere a situação para cancelado.' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS impedir_remocao_agendamento ON public.agendamento;
CREATE TRIGGER impedir_remocao_agendamento BEFORE DELETE ON public.agendamento
  FOR EACH ROW EXECUTE FUNCTION public.impedir_remocao_agendamento();
DROP TRIGGER IF EXISTS impedir_truncate_agendamento ON public.agendamento;
CREATE TRIGGER impedir_truncate_agendamento BEFORE TRUNCATE ON public.agendamento
  FOR EACH STATEMENT EXECUTE FUNCTION public.impedir_remocao_agendamento();

-- Cria comissões de registros pagos anteriores sem repetir as já vinculadas.
UPDATE public.agendamento a SET situacao = a.situacao
 WHERE a.situacao = 'pago' AND NOT EXISTS (SELECT 1 FROM public.despesa d WHERE d.agendamento_id = a.id);
