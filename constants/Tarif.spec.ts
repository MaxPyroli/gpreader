import Tarif from "./Tarif";

describe("tarif", () => {
  test.each([
    [1, "Navigo Jour/Semaine/Mois"],
    [2, "Navigo Annuel"],
    [4, "Imagin'R"],
    [5, "Imagin'R"],
    [4096, "Navigo Liberté +"],
    [20480, "Ticket t+"],
    [20496, "Ticket t+ (demi tarif)"],
    [32771, "Solidarité Transport"],
    [0, "Tarif inconnu (0)"],
  ])("%p renvoi le bon tarif %p", (codeTarif: number, nomTarif: string) => {
    const sut = new Tarif();
    expect(sut.getTarif(codeTarif)).toBe(nomTarif);
  });
});
