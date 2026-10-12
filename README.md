# Your Car

Site público e gestão de concessionária. Local: Node.js 24 e SQLite. Remoto: Supabase PostgreSQL e Supabase Storage, com hospedagem posterior na Vercel. Layout, galerias, animações e crédito NØVA DEV preservados.

## Uso local

```powershell
npm install
npm run build
npm start
```

Abra http://localhost:3333. Sem NODE_ENV=production, o banco fica em database/yor-car.sqlite e fotos em public/uploads. /setup cria o primeiro ADMIN; demonstração é opcional no modo local. Não existe senha padrão, seed automático remoto ou cadastro público.

O painel mantém veículos, estoque, clientes, leads, pedidos, reservas, vendas, pagamentos parciais, financeiro, vendedores, agendamentos, notificações, relatórios, usuários, auditoria e configurações. Comprar/Reservar criam solicitações com protocolo único; a equipe confirma reserva e pagamento. Não existe cobrança automática. Confirmar/Preparar/Pronto acompanham atendimento, sem substituir status financeiro.

Vendas atualizam estoque, custo, lucro, margem, recebimentos, pedidos relacionados, vendedor, cliente, lead e auditoria atomicamente. Cancelar reserva libera estoque. Não se pode vender duas vezes ou receber além do saldo. Dashboard e gráficos vêm do banco, com valores em centavos. Galeria permite várias fotos e capa editável.

## Supabase

server/postgres.mjs usa pg, pool pequeno, TLS com CA verificada, parâmetros SQL e uma conexão por transação. Advisory lock transacional compartilhado serializa operações entre instâncias; constraints protegem reserva e venda únicas. Essa estratégia conservadora pode limitar throughput, mas preserva integridade. Dinheiro usa BIGINT dentro do limite seguro de JavaScript; datas mantêm texto ISO para preservar timestamps importados.

Migrations em supabase/migrations criam 16 tabelas no esquema privado your_car, relações, identidades, índices, constraints, trigger de protocolo e RLS. anon/authenticated não têm grants nem policies administrativas. Não exponha your_car na Data API. O backend conserva bcrypt/JWT, HttpOnly, SameSite=Strict e Secure em produção. Usuários, auditoria e configurações exigem ADMIN. AUTH_SECRET e SETUP_SECRET exigem pelo menos 32 bytes; setup fica bloqueado após o primeiro usuário.

vehicle-images serve fotos publicamente, mas escrita direta anon/authenticated é bloqueada por policy restritiva. ADMIN recebe autorização temporária para um arquivo; nenhuma chave secreta chega ao navegador. Confirmação valida MIME, extensão, até 5 MB e assinatura do conteúdo. Fotos compartilhadas só são removidas depois da última referência. Falha externa mantém DELETING para evitar anexar um objeto possivelmente removido; reexecute limpeza em manutenção. Uploads abandonados PENDING também exigem manutenção. Validação de assinatura não equivale a antivírus ou decodificação completa.

## Migração e configuração

Leia [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). Variáveis: NODE_ENV, AUTH_SECRET, SETUP_SECRET, DATABASE_URL, DATABASE_SSL_CA, SUPABASE_URL, SUPABASE_SECRET_KEY. .env.example é apenas modelo vazio. Não é necessária chave publishable no frontend nem migração para Supabase Auth.

```powershell
npm run migrate:sqlite
npm run migrate:photos
```

Execute somente após migrations e configuração do ambiente. SQLite é aberto em leitura; IDs, hashes, relações, timestamps e centavos são preservados. Destino preenchido é rejeitado; sequences são corrigidas. Fotos referenciadas de public/uploads são copiadas por hash, com atualização transacional e relatório photos-migration-report.json. Erros mantêm os links originais. Scripts nunca rodam automaticamente nem apagam originais. Dados demonstrativos existentes permanecem demonstrativos.

Backup local gera SQLite; remoto exporta JSON administrativo com histórico. O JSON contém dados pessoais/hashes e deve ficar fora de ZIP/GitHub. Não contém fotos nem oferece restauração automática: mantenha também backup PostgreSQL do provedor e cópia do Storage.

## Testes

```powershell
npm install
npm run check
npm test
npm run build
```

Testes preservam os fluxos SQLite, executam migrations/SQL no PostgreSQL embarcado PGlite e verificam transações, RLS e Storage com doubles. Não substituem conexão TLS/pooler, URLs assinadas ou concorrência entre processos no Supabase real. A versão não foi publicada, enviada ao GitHub ou validada contra Supabase real nesta adaptação.

.vercelignore e excludeFiles impedem incluir bancos, uploads e credenciais locais no pacote da função.

Deploy atualizado
