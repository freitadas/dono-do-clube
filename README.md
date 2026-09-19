# Dono do Clube — MVP

Jogo de manager de futebol para navegador. Esta versão foi construída para ser simples de publicar com GitHub + Render.

## O que já funciona

- Cadastro e login por e-mail/senha.
- Sessão em cookie HttpOnly assinado.
- Criação de clube com nome e cores.
- Geração automática de 18 jogadores.
- 3 formações: 4-3-3, 4-4-2 e 3-5-2.
- Escolha dos 11 titulares.
- Simulação de partidas contra clubes controlados pelo sistema.
- Eventos de gols e recompensa por resultado.
- Moedas.
- Mercado de jogadores.
- Classificação da liga.
- Histórico dos últimos jogos.
- Layout responsivo para celular e computador.
- PostgreSQL.
- `render.yaml` para Blueprint do Render.
- Endpoint `/health`.

## Publicação no GitHub

1. Crie um repositório vazio no GitHub, por exemplo `dono-do-clube`.
2. Extraia este ZIP.
3. Envie **o conteúdo da pasta `dono-do-clube`** para a raiz do repositório.
4. Confirme que `render.yaml`, `package.json`, `server.js`, `src/` e `public/` aparecem na raiz.

## Publicação no Render usando Blueprint

1. Entre no Render.
2. Crie um novo Blueprint.
3. Conecte o repositório GitHub.
4. O Render lerá `render.yaml`.
5. O Blueprint cria:
   - um Web Service Node;
   - um PostgreSQL;
   - `DATABASE_URL` ligada automaticamente ao banco;
   - `APP_SECRET` gerada automaticamente.
6. Aplique o Blueprint e aguarde o deploy.
7. Abra a URL `*.onrender.com` fornecida pelo Render.

Não é necessário criar tabelas manualmente: o servidor cria o schema na inicialização.

## Rodar localmente

Você precisa de Node.js 20+ e PostgreSQL.

```bash
npm install
```

Copie `.env.example` para `.env`, ajuste `DATABASE_URL` e `APP_SECRET`, exporte as variáveis no seu terminal e rode:

```bash
npm start
```

Abra:

```text
http://localhost:3000
```

## Estrutura

```text
dono-do-clube/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── auth.js
│   ├── db.js
│   └── game.js
├── .env.example
├── .gitignore
├── package.json
├── render.yaml
├── server.js
└── README.md
```

## Antes de monetizar de verdade

Este é um MVP funcional. Antes de abrir pagamentos reais, é necessário acrescentar, no mínimo:

- rate limiting;
- recuperação de senha;
- verificação de e-mail;
- logs/auditoria;
- política de privacidade e termos;
- proteção antiabuso/antibot;
- pagamentos com webhooks idempotentes;
- painel administrativo;
- backups e política de retenção;
- testes automatizados;
- regras de economia para impedir exploração infinita de moedas.

## Próxima versão sugerida

1. Temporadas com início e fim.
2. Energia ou limite de partidas competitivo.
3. Venda de jogadores.
4. Treino/evolução.
5. Lesões e cartões.
6. Competições entre clubes de usuários.
7. Convites e ligas privadas.
8. Personalização de escudo/uniforme.
9. Passe de temporada e itens cosméticos.
