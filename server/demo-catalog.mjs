// Demonstration listings only. Prices and specifications are illustrative.
export const demoCatalog = [
 ['Audi','A3','Sedã • Seminovo',2023,32000,'Automático','Gasolina','Cinza','Sedã',189900,'audi-a3'],
 ['Honda','Civic','Sedã • Seminovo',2022,38000,'Automático','Flex','Preto','Sedã',159900,null],
 ['Toyota','Corolla','Sedã • Seminovo',2024,24000,'Automático','Flex','Prata','Sedã',149900,null],
 ['Chevrolet','Camaro','ZL1 • Seminovo',2020,28000,'Automático','Gasolina','Azul','Outro',389900,'camaro'],
 ['Mercedes-Benz','C 200','Sedã • Seminovo',2023,26000,'Automático','Gasolina','Preto','Sedã',269900,null],
 ['Renault','Kwid','Outsider • Seminovo',2024,26500,'Manual','Flex','Branco','Hatch',78990,'kwid'],
 ['Hyundai','HB20S','Limited • Novo',2026,0,'Automático','Flex','Cinza','Sedã',96900,'hb20s'],
 ['Chevrolet','Onix','RS • Seminovo',2025,27500,'Automático','Flex','Preto','Hatch',101790,'onix'],
 ['Volkswagen','Polo','Track • Novo',2025,0,'Manual','Flex','Branco','Hatch',109900,'polo'],
 ['Fiat','Argo','Trekking • Seminovo',2026,28500,'Manual','Flex','Prata','Hatch',93990,'argo'],
 ['Chevrolet','Onix Plus','Premier Turbo • Novo',2025,0,'Automático','Flex','Prata','Sedã',112900,'onix-plus'],
 ['Volkswagen','T-Cross','SUV • Seminovo',2025,29500,'Automático','Flex','Prata','SUV',145900,'t-cross']
];
export function setDemoVehicle(db,id,entry){
 const [brand,model,version,year,km,transmission,fuel,color,body,price,photo]=entry;
 const image=photo?`/assets/vehicle-${photo}.jpg`:null;
 const description=photo?'Anúncio de demonstração com imagem fornecida. Preço e especificações ilustrativos; confirme os dados com a equipe.':'Anúncio de demonstração. Foto própria ainda não cadastrada. Preço e especificações ilustrativos.';
 return db.prepare("UPDATE vehicles SET condition=CASE WHEN ?=0 THEN 'Novo' ELSE 'Seminovo' END,brand=?,model=?,version=?,year=?,km=?,transmission=?,fuel=?,color=?,body=?,price=?,cost=?,image=?,description=? WHERE id=? AND status!='VENDIDO'").run(km,brand,model,version,year,km,transmission,fuel,color,body,price*100,Math.round(price*.85)*100,image,description,id);
}
