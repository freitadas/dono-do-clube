# Dono do Clube — versão flat

Esta versão foi feita especificamente para evitar problemas de upload de pastas no GitHub.

A raiz do repositório precisa ter somente estes arquivos principais:

- `server.js`
- `package.json`
- `render.yaml`
- `README.md`

Não existe pasta `src/`.
Não existe pasta `public/`.

O `server.js` contém backend, banco, regras do jogo e interface.

## Para atualizar o repositório já existente

1. Apague os arquivos antigos do repositório ou substitua-os.
2. Envie os quatro arquivos desta versão para a raiz do repositório.
3. Faça commit na branch `main`.
4. O Render deverá iniciar novo deploy automaticamente.
5. Não crie outro banco.
6. Não crie outro Blueprint.

## Erro que esta versão elimina

A versão anterior dependia de `./src/db`, `./src/auth` e `./src/game`.
Se a pasta `src` não fosse enviada pelo navegador, o Render encerrava com `MODULE_NOT_FOUND`.

Esta versão não possui dependências locais.
