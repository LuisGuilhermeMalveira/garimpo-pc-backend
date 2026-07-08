# garimpo-pc-backend

Backend do **garimpo-pc** — PWA pessoal de arbitragem de hardware usado.
Node.js + Express + PostgreSQL, com **camada de IA pluggable** (Anthropic/Claude e OpenAI/GPT-4o).

> **Estado: Fases 1 e 2.** Fundação (banco + IA + preço-base) + triagem individual (a lupa).
> Lote (Fase 3) **ainda não** implementado — a tabela `candidatos_lote` já existe no schema,
> mas as rotas de lote virão depois.

---

## O que já funciona

- **Banco** completo (`001_init.sql`): usuário com config de negócio, cidades, modificadores e peças unitárias **seedados**.
- **Camada de IA pluggable**: troca de provider por `AI_PROVIDER` (global) ou por tarefa (`AI_PROVIDER_LOTE/PARSER/CALIBRADOR`); endpoint `/ai/comparar` roda os dois no mesmo print.
- **CRUD**: `pecas` (com frescor + tendência), `precos_base`, `modificadores`, `cidades`.
- **Calibração**: `POST /precos-base/calibrar` lê um print de busca via IA, calcula **mediana descartando outliers ±35%** e devolve a faixa (não grava — você confirma e grava).
- **Auth** por token (Bearer), `.env.example` e este README.

---

## Pré-requisitos

- Node.js 20+
- PostgreSQL (local ou Railway)
- Chave de pelo menos um provider de IA (Anthropic e/ou OpenAI) para calibrar/comparar

---

## Rodar local

```bash
cd C:\shared\garimpo-pc-backend

# 1. instalar dependências
npm install

# 2. configurar ambiente
copy .env.example .env        # (PowerShell: Copy-Item .env.example .env)
#  -> edite o .env: DATABASE_URL, APP_TOKEN, ANTHROPIC_API_KEY/OPENAI_API_KEY

# 3. criar/migrar o banco (roda 001_init.sql)
npm run migrate

# 4. subir o servidor (dev = nodemon)
npm run dev
# ou: npm start
```

Servidor sobe em `http://localhost:3001` (ajuste `PORT` no `.env`).

### Banco local rápido (opcional)

Se não tiver Postgres, suba um via Docker:

```bash
docker run --name garimpo-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=garimpo -p 5432:5432 -d postgres:16
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/garimpo
# DB_SSL=false
```

---

## Migrations

- Arquivos SQL numerados em `src/db/migrations/` (`001_init.sql`, `002_...`).
- `npm run migrate` aplica os pendentes em ordem; controle em `_migrations` (idempotente).
- Para uma migration nova, crie `002_xxx.sql` e rode `npm run migrate` de novo.

No **Railway**, configure o deploy pra rodar `npm run migrate` antes do `npm start`.

---

## Autenticação

Todas as rotas (exceto `/health` e `/`) exigem o token de `APP_TOKEN`. Envie em qualquer um:

```
Authorization: Bearer <APP_TOKEN>
x-app-token: <APP_TOKEN>
?token=<APP_TOKEN>      (conveniência p/ Share Target / testes no navegador)
```

---

## Endpoints (Fase 1)

### Saúde
- `GET /health` — checa app + banco (sem auth)

### Cidades
- `GET /cidades`
- `POST /cidades` — `{ nome, km_ida_volta, custo_aquisicao }`
- `PATCH /cidades/:id`

### Peças & preço-base
- `GET /pecas` — `?categoria=` `?tipo=` `?frescor=fresco|recente|envelhecendo|defasado|sem_dados`
  → cada peça vem com `preco_base` mais recente, `frescor` (🟢🟡🟠🔴) e `tendencia`.
- `POST /pecas` — `{ categoria, nome, tipo?, capacidade?, liquidez?, dias_venda_estim?, observacao? }`
- `PATCH /pecas/:id`
- `GET /pecas/:id/historico` — calibrações cronológicas + tendência
- `POST /precos-base/calibrar` **(IA)** — `multipart` campo `imagem` **ou** JSON `{ imagem_base64 }` **ou** `{ texto }`; opcionais `peca_id`, `nome_busca`, `tolerancia`.
  → `{ precos_lidos, faixa:{ preco_min, preco_mediana, preco_max, usados, descartados, ... }, provider }`. **Não grava.**
- `POST /precos-base` — grava a calibração confirmada: `{ peca_id, preco_min, preco_mediana, preco_max, amostras?, fonte? }` **ou** `{ peca_id, precos:[...] }` (recalcula a faixa no servidor).
- `POST /precos-base/manual` — gravação manual direta (fonte `manual`).

### Modificadores
- `GET /modificadores` — `?ativo=true|false`
- `POST /modificadores` — `{ nome, gatilho, sentido:'sobe'|'desce', percentual, argumento?, ativo? }`
- `PATCH /modificadores/:id`

### Triagem individual — a lupa (Fase 2)
- `POST /prospeccoes/analisar` **(IA)** — `multipart` campo `imagem` **ou** JSON `{ texto, origem?, cidade_id?, custo_recuperacao? }`.
  → parser (IA) extrai specs+sinais → `avaliador` decompõe, casa com o banco, aplica modificadores, fator de realização e custos → devolve **veredito completo** (conta aberta, lucro/mês, 3 preços, munição, canibalização, score). Peça sem preço → `incompleto` + lista pra calibrar. **Não grava.**
- `POST /prospeccoes` — re-avalia a partir de `raw_extracao` (servidor é a verdade) e **grava**: `{ raw_extracao, titulo?, origem?, cidade_id?, link_origem?, imagem_url? }`.
- `GET /prospeccoes` — `?status=analisado|comprei|passei` (fila de ação)
- `GET /prospeccoes/:id` — detalhe (itens + modificadores aplicados)
- `PATCH /prospeccoes/:id` — `{ status, preco_venda_real? }` (comprei/passei + venda real)
- `POST /prospeccoes/:id/simular` — recalcula **sem os itens removíveis** ("sem o monitor")

> A lupa só dá veredito de margem **depois** que o banco de preços tem as peças calibradas.
> Antes disso ela responde `incompleto` dizendo exatamente o que calibrar — é o fluxo desenhado.

### IA
- `GET /ai/config` — provider ativo (global + por tarefa), sem expor chaves
- `POST /ai/comparar` **(IA)** — `{ tarefa:'calibrador'|'parser'|'lote' }` + `imagem`/`texto`
  → roda nos **dois** providers, devolve saídas lado a lado + tempo (ms) + erro.

---

## Exemplos (cURL)

```bash
TOKEN=troque-este-token

# catálogo (só peças seedadas até calibrar)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/pecas

# criar uma GPU no catálogo
curl -X POST http://localhost:3001/pecas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"categoria":"gpu","nome":"RTX 4060 8GB","liquidez":"alta","dias_venda_estim":10}'

# calibrar por print (multipart)
curl -X POST http://localhost:3001/precos-base/calibrar \
  -H "Authorization: Bearer $TOKEN" \
  -F "peca_id=7" -F "imagem=@C:/prints/busca_rtx4060.png"

# calibrar por texto (sem imagem) — útil pra testar sem print
curl -X POST http://localhost:3001/precos-base/calibrar \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"texto":"anúncios: 1650, 1700, 1780, 1800, 1900, 900, 2700"}'

# gravar a faixa confirmada
curl -X POST http://localhost:3001/precos-base \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"peca_id":7,"preco_min":1650,"preco_mediana":1780,"preco_max":1900,"amostras":5,"fonte":"print busca OLX"}'

# comparar os dois providers no mesmo print
curl -X POST http://localhost:3001/ai/comparar \
  -H "Authorization: Bearer $TOKEN" \
  -F "tarefa=calibrador" -F "imagem=@C:/prints/busca_rtx4060.png"
```

---

## Estrutura

```
src/
├── index.js                 # app Express + montagem das rotas
├── db/
│   ├── pool.js              # pool pg (SSL automático p/ Railway)
│   ├── migrate.js           # runner de migrations (npm run migrate)
│   └── migrations/001_init.sql
├── middleware/
│   ├── auth.js              # token Bearer (single-user)
│   └── upload.js            # multer (memória) + helper de imagem
├── routes/
│   ├── cidades.js · pecas.js · precosBase.js · modificadores.js · ai.js
├── ai/                      # camada pluggable
│   ├── index.js             # seletor (AI_PROVIDER + override) + compararProviders()
│   ├── interface.js         # contrato + parse JSON seguro
│   ├── prompts.js           # prompts/schemas (calibrador, parser, lote)
│   └── providers/anthropic.js · openai.js
├── services/
│   ├── calibrador.js        # IA -> preços -> faixa
│   └── frescor.js           # frescor + tendência
└── utils/
    ├── mediana.js           # mediana + descarte de outliers ±35%
    └── cloudinary.js        # upload opcional de prints
```

---

## Variáveis de ambiente

Veja `.env.example`. Principais: `DATABASE_URL`, `APP_TOKEN`, `AI_PROVIDER`,
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`. `CLOUDINARY_URL` é opcional na Fase 1.

---

## Próximas fases (não implementadas)

- **Fase 3 (peneira):** `parserLote`, `avaliadorRapido`, `/lote/analisar` e o ciclo de candidatos.
  (o `dedup`/`fingerprint` e o parser de lote já existem; falta a rota de lote e o avaliador rápido).
- **Fase 4:** registrar venda real → métrica de acerto, polimento de PWA/Share Target.
- **Frontend** (`garimpo-pc-frontend`): telas de Triagem, Lote, Catálogo e Histórico — repo separado.
