import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AxiosError } from 'axios';

@Injectable()
export class VatService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async checkVatStatus(nip: string) {
    // API MF wymaga daty zapytania (format YYYY-MM-DD)
    const today = new Date().toISOString().slice(0, 10);
    const baseUrl = this.configService.get<string>('MF_API_URL');
    
    // Budujemy URL: https://wl-api.mf.gov.pl/api/search/nip/1234567890?date=2025-01-11
    const url = `${baseUrl}${nip}?date=${today}`;

    console.log(`[VatService] Odpytuję URL: ${url}`);

    try {
      // Wykonujemy prawdziwy strzał GET
      const { data } = await firstValueFrom(
        this.httpService.get(url).pipe(
          catchError((error: AxiosError) => {
            // Obsługa błędów HTTP (np. 404, 500 z ministerstwa)
            console.error('Błąd API MF:', error.response?.data || error.message);
            throw new HttpException(
              'Nie udało się pobrać danych z rejestru VAT', 
              HttpStatus.BAD_GATEWAY
            );
          }),
        ),
      );

      // Logika biznesowa: Sprawdzamy co przyszło
      // API MF zwraca obiekt w polu "result.subject"
      const subject = data?.result?.subject;

      if (!subject) {
        return {
          found: false,
          source: 'MF_Biala_Lista',
          status: 'Nieznany',
        };
      }

      // Mapujemy dziwne nazwy z API na nasze ładne pola
      return {
        found: true,
        source: 'MF_Biala_Lista',
        name: subject.name, // Pełna nazwa firmy
        nip: subject.nip,
        statusVat: subject.statusVat, // np. "Czynny"
        regon: subject.regon,
        krs: subject.krs,
        address: subject.workingAddress || subject.residenceAddress,
        accountNumbers: subject.accountNumbers, // Tablica kont bankowych!
        registrationDate: subject.registrationLegalDate,
      };

    } catch (error) {
       // Jeśli to nasz HttpException, rzuć go dalej, jeśli nie - rzuć ogólny
       if (error instanceof HttpException) throw error;
       throw new HttpException('Błąd wewnętrzny serwisu VAT', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
