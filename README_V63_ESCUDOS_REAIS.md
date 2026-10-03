# Dono do Clube v63 — escudos reais

Esta versão substitui a geração de SVGs com iniciais por arquivos de escudos identificados por clube e país.

- 1057 registros de clubes reais cobertos, incluindo os clubes brasileiros dos 27 estados, clubes internacionais e participantes do Mundial presentes na base.
- 30 seleções com emblemas das federações/seleções.
- 1048 arquivos PNG locais em `assets/crests`, incluídos neste ZIP. As partidas não dependem de URLs de imagens externas.
- Tabelas, calendários, mata-matas, campeões, perfis, propostas, históricos, mercado e telas de seleção usam o mesmo catálogo.
- A inicialização do servidor troca os antigos escudos automáticos nas carreiras já existentes. IDs, jogadores, dinheiro e resultados são preservados pela alteração de escudos.
- A base também contém 1604 nomes fictícios, como `English D09 (ENG)`, e entidades auxiliares. Eles não têm escudo oficial. A v63 exibe um traço em vez de fabricar um escudo ou atribuir o de outro time.
- Um clube criado pelo usuário com nome próprio pode manter a imagem enviada por ele. Nomes reconhecidos de clubes reais usam o escudo do catálogo.

## Executar

Mantenha `DATABASE_URL` e `APP_SECRET` do projeto existente. Execute `npm install` e `npm start`, ou publique o pacote completo no mesmo serviço usado pela v62. Esta entrega é o código atualizado; não altera automaticamente uma instalação já publicada.

## Conferir

Execute `npm run test:crests` para validar catálogo, cobertura, integridade das imagens, migração de escudos e renderização de clubes/seleções. Não exige conexão com o banco.
Abra `ESCUDOS_REAIS.html` para consultar as imagens incluídas. O arquivo funciona localmente após extrair este ZIP.

## Fontes

Os vínculos exatos entre cada registro, arquivo, hash SHA-256 e origem estão em `real_crests_manifest.json`.
Fontes: https://github.com/JoseArroyave/football-logos ; https://github.com/luukhopman/football-logos ; https://escudosfc.com.br/ . As marcas pertencem aos clubes e às federações. A inclusão identifica os participantes e não representa licença, patrocínio ou vínculo oficial.
