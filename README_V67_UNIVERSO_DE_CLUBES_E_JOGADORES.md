# Dono do Clube v67 — Universo de Clubes e Jogadores

## Implementado

- Sincronização opcional, no servidor, com a base pública `EAFC26-DataHub` (SoFIFA/FC 26).
- Importação dos jogadores da base para seus clubes atuais, usando nome, clube, posição, idade, overall, potencial, nacionalidade e atributos disponíveis.
- Clubes que já existem no Dono do Clube são reconciliados pelo nome; clubes adicionais da base FC26 são cadastrados automaticamente.
- O antigo `Mercado Mundial` artificial não contém mais jogadores.
- Ao começar carreira com clube real, o elenco do clube-fonte é copiado para a carreira em vez de gerar um elenco aleatório novo.
- O seletor de clubes reais não limita mais a listagem a 40 clubes por divisão.
- O mercado de transferências pesquisa o universo inteiro de jogadores cadastrados, sem bloqueio por divisão.
- O mercado possui paginação de 120 jogadores por página e informa o total encontrado.
- Filtros continuam disponíveis por nome, posição, OVR, idade, potencial, nacionalidade, salário, valor e clube atual.
- Novo endpoint autenticado `/api/universe/status` informa totais de clubes, jogadores, jogadores reais e agentes livres.

## Fonte externa

Por padrão, o servidor tenta sincronizar:
`https://raw.githubusercontent.com/ismailoksuz/EAFC26-DataHub/main/data/players.csv`

A sincronização pode ser desligada com `FC26_SYNC=0`. Se a fonte externa estiver temporariamente indisponível, o jogo continua iniciando com a base local e tenta novamente em reinicialização futura.

## Observação

A base externa é uma fotografia de dados de EA FC 26/SoFIFA e não equivale a uma API oficial em tempo real de transferências. Clubes adicionais do universo original do Dono do Clube que não tenham correspondência nessa base continuam usando o sistema local de elenco quando forem carregados.
