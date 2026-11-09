# Publicação ARTVAC

O relatório local, PDF e texto para WhatsApp funcionam sem serviço adicional. O link público exige a configuração abaixo uma única vez. O painel da empresa é `artvac.html`, separado do `index.html` do Planner.

## Configuração Inicial

1. Crie um projeto novo no Google Apps Script da sua conta. Não altere o projeto que sincroniza o Planner.
2. Cole o conteúdo de `server/artvac.gs` no novo projeto.
3. Execute `setupArtvac` e autorize a criação de uma pasta privada no seu Drive. O registro de execução mostra a chave de publicação. Guarde essa chave somente para configurar o seu painel.
4. Em **Implantar > Nova implantação > Aplicativo da Web**, escolha executar como você e acesso **Qualquer pessoa**. Isso permite à empresa abrir o link sem login. Se a conta institucional não permitir essa opção, a publicação anônima não estará disponível nessa conta.
5. Copie a URL terminada em `/exec`.
6. No Planner, abra **Frequência > Relatório ARTVAC > Configurar publicação**, informe a URL e a chave e clique em **Verificar e salvar**.

Essa configuração é local ao navegador, não é sincronizada com a turma e nunca é enviada no link. No notebook do SENAI, configure o serviço novamente. Não envie a chave de publicação à empresa.

## Uso

- Selecione a semana ou período de fechamento, por exemplo 16/10 a 15/11.
- Em **Dias de aula e folhas de ponto**, desmarque feriados/dias sem aula e informe a data em que as folhas foram enviadas por WhatsApp. Salve as informações do período.
- Confirme as chamadas na área de Frequência. A presença não é presumida quando falta registro, confirmação ou há conflito entre disciplinas.
- Registre atrasos, saídas e a situação dos documentos em campos destinados à empresa. As observações internas da frequência e os anexos nunca são copiados.
- Confira a prévia e publique. A empresa só recebe o retrato conferido desse momento, não alterações futuras do Planner.
- Copie o link em **Publicação deste período**. O link é o mesmo para todos os períodos publicados daquela turma, até uma troca de link.
- Para corrigir, gere nova prévia e publique o mesmo período novamente.
- Para retirar o período, use **Retirar publicação deste período**. Os registros originais da turma permanecem intactos.
- O dashboard permite escolher períodos publicados e imprimir/salvar como PDF. Para períodos longos, o PDF contém o resumo e a lista de ocorrências, sem comprimir dezenas de colunas em uma folha.

## Limites e Cuidados

- Quem receber ou encaminhar o link poderá consultar todos os períodos publicados dessa turma. Não há identificação dos leitores nem login.
- **Trocar link de acesso** invalida o endereço anterior da turma inteira. É necessário enviar o novo link à empresa.
- Não inclua diagnósticos, CID, fotos de atestados ou informações internas no campo destinado à empresa.
- Os arquivos JSON ficam em uma pasta privada no Drive. Não compartilhe essa pasta nem os arquivos diretamente. A rota pública serve somente o relatório sanitizado associado ao token.
- Retirar uma publicação não apaga PDFs, prints ou mensagens que alguém já tenha guardado. Os arquivos retirados ficam privados no Drive; a exclusão definitiva pode ser feita pela proprietária conforme sua rotina de retenção.
- São suportados até 100 aprendizes, 93 dias por relatório e 36 períodos publicados por turma.
- O código foi preparado e testado com serviço simulado. A ativação real depende de implantar o novo Apps Script e validar o acesso anônimo e as permissões da conta usada.
