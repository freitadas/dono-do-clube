# Dono do Clube v5 — gestão, mercado e partidas aprimorados

Esta versão mantém a carreira A/B/C/D + Estaduais + Libertadores e adiciona uma camada de gestão mais completa.

## Novidades

- Campo visual da escalação na aba **Elenco**.
- Jogadores aparecem no gramado de acordo com a formação.
- Botão **Sugerir rodízio**.
- Físico/fadiga de 0 a 100.
- Moral dos jogadores.
- Lesões por número de jogos.
- Jogadores cansados perdem rendimento.
- IA também monta times considerando condição física.
- Resultados com força do elenco, ataque, defesa, físico, moral e vantagem de jogar em casa.
- Posições mais detalhadas: GK, CB, RB, LB, CDM, CM, CAM, RM, LM, RW, LW e ST.
- Elencos novos com distribuição de posições mais equilibrada.

## Dinheiro e salários

- Caixa inicial de novos clubes: 30.000 moedas.
- Migração de clubes existentes para um caixa mínimo de 25.000 moedas.
- Salário individual por rodada.
- Folha salarial total.
- Receita de patrocinadores.
- Bilheteria em jogos em casa.
- Bônus por resultado.
- Registro de receitas e despesas.
- Rescisão custa duas rodadas de salário.
- Contratos de 1 a 4 temporadas.
- Renovação automática de segurança no fim do contrato para não deixar a equipe sem jogadores.

## Transferências

A compra direta foi removida.

Na aba **Mercado** existe pesquisa por:
- nome;
- posição;
- overall mínimo;
- preço máximo.

O sistema encontra:
- jogadores livres;
- jogadores de clubes controlados pelo jogo.

Para contratar:
1. o clube vendedor pode aceitar ou recusar a taxa;
2. o jogador avalia salário, duração do contrato, força do seu clube e divisão;
3. o atleta pode recusar a proposta;
4. em caso de aceite, taxa + luvas são descontadas imediatamente;
5. o salário passa a integrar a folha salarial.

## Eventos inesperados

Podem ocorrer:
- lesões;
- bônus comercial;
- melhora de moral;
- evolução no treino;
- recuperação física do elenco;
- impacto de caixa negativo no moral.

## Competições

Foram adicionados:
- trava contra clique duplo/simulações simultâneas;
- reparo automático de estado quando uma rodada/fase já foi concluída;
- recuperação de progressão do Estadual;
- recuperação de rodada do Brasileirão;
- recuperação da Libertadores quando o estado da competição fica inconsistente.

## Persistência

Conta, clube, carreira, finanças, jogadores e demais dados continuam no PostgreSQL do Render.
