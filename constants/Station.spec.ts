import { Mode } from "./EventCode";
import Station from "./Station";

describe("station", () => {
  test.each([
    [Mode.Tramway, 415, "Meudon la Forêt"],
    [Mode.BusUrbain, 262, "Cergy Saint Christophe RER"],
    [Mode.BusUrbain, 338, "Léon Cassé (Corbeil Essonnes)"],
    [Mode.Tramway, 33754, "Gare de Jusivy RER"],
    [Mode.Tramway, 32776, "La Belle Épine"],
    [Mode.Tramway, 32786, "Porte de l'Essonne"],
    [Mode.Tramway, 62924, "Porte de Choisy"],
  ])("Mode %p, station %p renvoi la bonne station %p", (codeEvent: number, codeStation: number, nomStation: string) => {
    const sut = new Station();
    expect(sut.getStation(codeEvent * 16, codeStation)).toBe(nomStation);
  });
});
