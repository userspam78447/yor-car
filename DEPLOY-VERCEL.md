# Configurar Your Car com Supabase e depois Vercel

Esta adaptação foi validada localmente. A conexão ao seu Supabase e um deploy real ainda precisam ser testados. Não use o token pessoal de gerenciamento no site.

## 1. Supabase

1. Crie um projeto dedicado Your Car na organização escolhida. Confira plano/custo e guarde a senha PostgreSQL em um gerenciador de senhas. Preserve os projetos de outros sistemas.
2. Abra SQL Editor e execute, nesta ordem, os arquivos completos:
   - supabase/migrations/20261010141212_your_car_schema.sql
   - supabase/migrations/20261010141247_vehicle_images_storage.sql
3. Para execução manual, envolva o conteúdo de cada arquivo em BEGIN; e COMMIT; e execute tudo junto. Em erro, use ROLLBACK e investigue. Não misture o método manual com db push sem reconciliar o histórico de migrations na CLI.
4. No Table Editor escolha your_car e confira 16 tabelas. Não adicione esse esquema à Data API.
5. Em Storage confira vehicle-images: público, limite 5 MB, JPEG/PNG/WebP. A policy vehicle_images_backend_only é restritiva para anon/authenticated. Não adicione escrita pública. A leitura de imagens públicas não exige grants nas tabelas administrativas.
6. Confira os Database Advisors. As tabelas têm RLS e grants revogados para anon/authenticated; o backend usa a conexão PostgreSQL administrativa.

Confira no SQL Editor:

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='your_car' ORDER BY tablename;
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='vehicle-images';
SELECT policyname, permissive, roles, cmd FROM pg_policies WHERE schemaname='storage' AND policyname='vehicle_images_backend_only';
```

## 2. Configurações necessárias

1. Clique Connect. Para Vercel copie Transaction pooler; para migrações use Direct connection ou Session pooler se sua rede não tiver IPv6. Use o host/porta/usuário exatos do painel. Substitua o marcador de senha com caracteres especiais percent-encoded. O driver não usa prepared statements nomeados.
2. Em Database Settings > SSL Configuration baixe o certificado CA. DATABASE_SSL_CA recebe o conteúdo PEM completo, com linhas reais. TLS verifica certificado e hostname; não desative a verificação para contornar erros.
3. Em API/API Keys obtenha URL e secret key do projeto para o backend. Se o painel só oferecer service_role legado, ele pode ser usado como SUPABASE_SECRET_KEY. Nunca coloque essa chave no navegador.
4. Gere AUTH_SECRET e SETUP_SECRET distintos, aleatórios, com pelo menos 32 bytes.

| Variável | Valor |
|---|---|
| NODE_ENV | production |
| DATABASE_URL | conexão PostgreSQL com senha, somente backend |
| DATABASE_SSL_CA | conteúdo PEM completo da CA |
| SUPABASE_URL | URL HTTPS do projeto |
| SUPABASE_SECRET_KEY | secret key do projeto, somente backend |
| AUTH_SECRET | segredo aleatório para JWT |
| SETUP_SECRET | segredo distinto para primeiro ADMIN |

Não é necessária chave publishable no frontend. Nunca preencha .env.example com valores reais. Scripts leem as variáveis do processo, sem carregar .env automaticamente.

## 3. Importar banco e fotos locais

Faça antes de abrir /setup no destino. A importação exige tabelas de negócio vazias. Se importar usuários, mantenha o login existente; não será necessário criar novo ADMIN. Preserve o SQLite original e as fotos até conferir tudo.

No PowerShell, leia valores protegidos, sem credenciais no histórico:

```powershell
$env:DATABASE_URL=[System.Net.NetworkCredential]::new('',(Read-Host 'Conexão PostgreSQL' -AsSecureString)).Password
$env:DATABASE_SSL_CA=Get-Content -LiteralPath 'C:\caminho\certificado-supabase.crt' -Raw
$env:SUPABASE_URL=Read-Host 'URL do projeto'
$env:SUPABASE_SECRET_KEY=[System.Net.NetworkCredential]::new('',(Read-Host 'Secret key' -AsSecureString)).Password
npm install
npm run migrate:sqlite
npm run migrate:photos
```

Ajuste o caminho do certificado. O primeiro script copia database/yor-car.sqlite preservando IDs, relações, hashes, timestamps e centavos, rejeita destino preenchido e corrige sequences. O segundo migra fotos referenciadas de public/uploads, evita duplicação por hash, atualiza o banco transacionalmente e grava photos-migration-report.json. Erros mantêm os links originais: resolva todos antes de publicar. /assets continua no código; arquivos de uploads sem referência não são migrados automaticamente. Nenhum original é apagado. Se importar demonstração, ela permanece demonstrativa.

Confira contagens, pagamentos e URLs no SQL Editor:

```sql
SELECT COUNT(*) FROM your_car.vehicles;
SELECT COUNT(*) FROM your_car.orders;
SELECT COUNT(*) FROM your_car.sales;
SELECT SUM(amount) FROM your_car.payments;
SELECT id, image, gallery FROM your_car.vehicles ORDER BY id;
```

Não abra setup ou lance pedidos remotos antes de uma importação planejada.

## 4. Validar antes de publicar

Configure AUTH_SECRET e SETUP_SECRET com Read-Host -AsSecureString e NetworkCredential, da mesma forma acima. Para usar banco remoto, defina NODE_ENV=production e execute npm start. Para voltar ao SQLite, abra terminal novo sem NODE_ENV=production. Cookies Secure exigem HTTPS: teste autenticação com HTTPS local ou, depois, em preview protegido. Não retire Secure para contornar HTTP local.

1. Em base vazia, teste SETUP_SECRET errado, crie ADMIN em /setup e confirme que setup fica bloqueado. Em base importada, teste o login existente.
2. Confira HttpOnly, SameSite=Strict, Secure e revogação de vendedor. VENDEDOR não deve gerenciar usuários, configurações, auditoria ou uploads.
3. Cadastre cliente e carro, edite e confirme persistência no Supabase. Dashboard deve refletir o banco.
4. Em duas sessões, tente reservar o mesmo carro para clientes diferentes: apenas uma reserva deve entrar. Cancele e confira disponibilidade.
5. Envie várias fotos, defina capa e salve a galeria. Formato/extensão inválidos, mais de 5 MB e usuário sem ADMIN devem ser recusados. Não deve haver secret key nas respostas ou no navegador.
6. Remova foto compartilhada de um anúncio: outro anúncio deve preservá-la. Remova a última referência e confira exclusão no Storage. Estados DELETING e uploads abandonados PENDING precisam de manutenção; não reutilize URLs removidas.
7. Sem login, solicite Comprar e Reservar. Confira protocolo, notificação e pedido no admin. Reenvio do mesmo request_id não pode duplicar. Solicitar reserva não bloqueia estoque até confirmação da equipe.
8. Registre venda com recebimento parcial e custo/despesa vinculada. Confira VENDIDO, estoque disponível, saldo, receita, lucro/margem, vendedor, cliente, pedidos, lead e auditoria.
9. Tente segunda venda, recebimento acima do saldo e operações simultâneas em sessões diferentes. Devem ser bloqueados. Os testes locais verificam rollback, mas concorrência entre processos precisa do Supabase real.
10. Exporte JSON administrativo e confira histórico. Guarde com proteção: contém dados pessoais/hashes. Faça backup PostgreSQL do provedor e cópia separada do Storage; JSON não contém fotos nem oferece restauração automática.

## 5. GitHub, somente após validação

Extraia o projeto. Não envie só ZIP. Preserve api/, client/, public/, scripts/, server/, tests/, supabase/ e os arquivos da raiz. Em repositório existente, clone primeiro e copie a estrutura; não apague histórico com force push.

```powershell
git init
git add api client public scripts server tests supabase .env.example .gitignore .vercelignore DEPLOY-VERCEL.md INICIAR-YOR-CAR.cmd package.json package-lock.json README.md vercel.json
git diff --cached --name-only
git commit -m "Adapt Your Car to Supabase PostgreSQL and Storage"
git branch -M main
git remote add origin https://github.com/userspam78447/yor-car3.git
git push -u origin main
```

Se origin já apontar para esse repositório, reutilize-o; não execute remote add novamente. Autentique com gerenciador de credenciais/GitHub, sem token em URL ou comando. Revise a lista: não enviar .env, banco, SQLite, _admin, uploads, node_modules ou relatório de migração. .env.example fica vazio.

## 6. Vercel, somente depois

1. Importe o repositório. Root Directory deve conter package.json; Framework: Other; Node.js 24.x. Install: npm install; Build: npm run build. Deixe Output Directory sem configuração: vercel.json encaminha para api/index.mjs e server/vercel-handler.mjs.
2. Cadastre as sete variáveis como valores protegidos. DATABASE_URL usa Transaction pooler. Preview deve usar projeto Supabase de homologação separado da loja.
3. Faça preview protegido e execute a etapa 4. Só promova após testar. Em erro TLS confira CA/hostname; em erro de esquema confira migrations; em upload confira bucket, secret key e policies.
4. Faça novo deploy e confirme que usuários, pedidos, vendas, auditoria e fotos continuam persistidos no Supabase. Nenhum banco ou upload depende do disco da Vercel.
5. Mantenha AUTH_SECRET estável para preservar sessões. Depois do ADMIN criado, pode remover SETUP_SECRET; a existência de usuários já bloqueia setup.

## Limitações e fontes

Ainda faltam conexão TLS/pooler remoto, URLs assinadas/Storage real, permissões efetivas do seu projeto e concorrência entre processos. Nenhuma migração remota, credencial real, push ou deploy foi executado nesta adaptação. Comprar não integra cobrança automática de cartão/PIX.

- [Conexão PostgreSQL e pooler](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [CA e TLS](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Storage](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
