# Dono do Clube v63 — escudos reais

Esta versão remove o sistema de brasões genéricos e passa a usar escudos reais de clubes e seleções.

## O que mudou

- clubes reais usam um catálogo de escudos reais do projeto `hixcoder/football-teams-flags`, com imagens hospedadas em `football-logos.cc`;
- uma segunda fonte (`FootyLogos`) é tentada automaticamente quando o primeiro catálogo não localiza o clube, ampliando principalmente a cobertura dos estaduais brasileiros;
- as 30 seleções nacionais disponíveis no jogo têm endereço direto para o escudo da seleção/federação;
- antigos SVGs genéricos da v62 são eliminados do banco ao carregar a base e não são mais exibidos;
- PNG/JPG/WebP personalizados enviados pelo usuário continuam tendo prioridade;
- os três clubes fictícios `Clube do País-Sede 1/2/3` foram substituídos por FC Cincinnati, Orlando City e Atlanta United;
- se nenhuma das fontes reais possuir a imagem de um clube, o jogo deixa o espaço neutro em vez de fabricar um brasão genérico.

## Dependência de rede

Para obter os escudos reais, o navegador precisa conseguir acessar:

- `raw.githubusercontent.com` — índice principal de clubes;
- `assets.football-logos.cc` — imagens do catálogo principal;
- `assets.footylogos.com` — segunda fonte de escudos, usada como fallback;
- `crests.football-data.org` — escudo da seleção de Portugal.

O catálogo principal é mantido em cache no navegador por 7 dias.
