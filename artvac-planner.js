'use strict';
let artvacDraft=null,artvacOwner='',artvacPublishing=false;
let artvacTransientLinks={},artvacTransientChannels={};
function artvacData(){return state.classData[getActiveClassId()];}
function artvacLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch(_){return fallback;}}
function artvacConfig(){return artvacLocal('artvac_service_v1',null);}
function artvacLinkMap(){return Object.fromEntries(Object.entries({...artvacLocal('artvac_links_v1',{}),...artvacTransientLinks}).filter(([,value])=>value));}
function artvacChannelMap(){return {...artvacLocal('artvac_channels_v1',{}),...artvacTransientChannels};}
function artvacStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}}
function finishArtvacOperation(){artvacPublishing=false;const button=document.getElementById('avPublish');if(button)button.disabled=!artvacDraft?.report.ready||!artvacConfig();}
function artvacEndpointValid(value){return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value)&&value!==APPS_SCRIPT_URL;}
function openArtvacReport(){
  if(isProfessorMode())return;
  artvacOwner=getActiveClassId();artvacDraft=null;
  let overlay=document.getElementById('artvacOverlay');
  if(!overlay){overlay=document.createElement('div');overlay.id='artvacOverlay';overlay.className='modal-overlay';overlay.addEventListener('click',event=>{if(event.target===overlay)closeArtvacReport();});overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeArtvacReport();}if(event.key!=='Tab')return;const nodes=[...overlay.querySelectorAll('button,input,select,textarea,summary,a[href]')].filter(node=>!node.disabled&&node.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});document.body.appendChild(overlay);}
  const dates=getWeekDates(state.weekOffset),h=ArtvacReport.escape;
  overlay.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="artvacTitle" style="width:1150px;max-width:97vw;max-height:94vh;display:flex;flex-direction:column"><div class="modal-head" style="flex-shrink:0"><h2 id="artvacTitle">Relatório ARTVAC</h2><button class="btn btn-outline" aria-label="Fechar" onclick="closeArtvacReport()">×</button></div>
    <div class="modal-body" style="overflow:auto;min-height:0"><div class="av-range-controls"><label class="form-group">De<input class="form-input" id="avStart" type="date" value="${localDateKey(dates[0])}"></label><label class="form-group">Até<input class="form-input" id="avEnd" type="date" value="${localDateKey(dates[4])}"></label><button class="btn btn-outline" onclick="artvacSetWeek()">Semana atual</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn btn-primary" onclick="renderArtvacPreview()">Gerar prévia</button><button class="btn btn-outline" onclick="openArtvacRecord()">Registrar atraso, saída ou justificativa</button><button class="btn btn-outline" onclick="openArtvacSettings()">Configurar publicação</button></div>
    <details style="margin-bottom:16px"><summary>Dias de aula e folhas de ponto</summary><div id="avDateOptions" style="padding:12px 0"></div><label class="form-group" style="display:block">Folhas de ponto enviadas em<input class="form-input" type="date" id="avPointSent"></label><button class="btn btn-outline" onclick="saveArtvacPeriod()">Salvar informações do período</button></details>
    <div id="avServiceStatus" style="font-size:12px;margin:8px 0"></div><div id="avReportContent"></div><details style="margin-top:18px"><summary>Registros destinados à empresa</summary><div id="avRecordList"></div></details>
    <details style="margin-top:18px"><summary>Publicação deste período</summary><div id="avPublicationStatus" style="padding:10px 0"></div><button class="btn btn-outline" onclick="withdrawArtvacPublication()">Retirar publicação deste período</button> <button class="btn btn-outline" onclick="rotateArtvacLink()">Trocar link de acesso da turma</button></details></div>
    <div class="modal-foot" style="display:flex;gap:8px;flex-wrap:wrap;flex-shrink:0"><button class="btn btn-outline" onclick="printArtvacReport()">Imprimir / salvar PDF</button><button class="btn btn-outline" onclick="copyArtvacText()">Copiar texto para WhatsApp</button><button class="btn btn-primary" id="avPublish" onclick="publishArtvacReport()">Publicar para a ARTVAC</button></div></div>`;
  overlay.classList.add('open');
  overlay.querySelector('.modal-body').addEventListener('input',()=>{artvacDraft=null;document.getElementById('avPublish').disabled=true;});
  ['avStart','avEnd'].forEach(id=>document.getElementById(id).addEventListener('change',()=>{loadArtvacPeriod();renderArtvacPreview();}));
  loadArtvacPeriod();renderArtvacPreview();setTimeout(()=>document.getElementById('avStart')?.focus(),0);
}
function closeArtvacReport(){if(artvacPublishing)return showToast('Aguarde a confirmação da publicação.',true);document.getElementById('artvacOverlay')?.classList.remove('open');artvacDraft=null;document.getElementById('artvacReportBtn')?.focus();}
function assertArtvacOwner(){if(artvacOwner!==getActiveClassId())throw Error('A turma mudou. Feche o relatório e abra novamente.');}
function artvacRange(){return {start:document.getElementById('avStart').value,end:document.getElementById('avEnd').value};}
function artvacPeriodKey(){const {start,end}=artvacRange();return start+'_'+end;}
function artvacStudents(){return (state.alunos||[]).filter(student=>student.turmaId===getActiveClassId()).map(student=>({id:student.id,name:student.nome}));}
function artvacSetWeek(){const dates=getWeekDates(0);document.getElementById('avStart').value=localDateKey(dates[0]);document.getElementById('avEnd').value=localDateKey(dates[4]);loadArtvacPeriod();renderArtvacPreview();}
function loadArtvacPeriod(){
  try{
    assertArtvacOwner();const {start,end}=artvacRange(),saved=artvacData().artvacPeriods?.[artvacPeriodKey()]||{},h=ArtvacReport.escape;
    document.getElementById('avDateOptions').innerHTML=ArtvacReport.dates(start,end).map(date=>`<label style="display:inline-block;margin:0 14px 8px 0"><input type="checkbox" name="avIncludedDate" value="${date}" ${saved.excluded?.includes(date)?'':'checked'}> ${h(ArtvacReport.formatDate(date))}</label>`).join('');
    document.getElementById('avPointSent').value=saved.pointSentAt||'';
  }catch(error){showToast(error.message,true);}
}
function saveArtvacPeriod(){
  try{
    assertArtvacOwner();const {start,end}=artvacRange();ArtvacReport.dates(start,end);const pointSentAt=document.getElementById('avPointSent').value;
    if(pointSentAt)chatImportDate(pointSentAt);
    const excluded=[...document.querySelectorAll('[name="avIncludedDate"]:not(:checked)')].map(input=>input.value);
    if(commitProductivity('informações do período ARTVAC',()=>{const data=artvacData();data.artvacPeriods={...(data.artvacPeriods||{}),[artvacPeriodKey()]:{excluded,pointSentAt}};})){renderArtvacPreview();showToast('Informações do período salvas.');}
  }catch(error){showToast(error.message,true);}
}
function renderArtvacPreview(){
  const button=document.getElementById('avPublish');button.disabled=true;artvacDraft=null;
  try{
    assertArtvacOwner();const {start,end}=artvacRange(),days=ArtvacReport.dates(start,end);
    const students=artvacStudents(),effectiveAbsences=Object.fromEntries(days.map(date=>[date,students.filter(student=>getAfastamentoOcorrenciaParaFrequencia(date,student.name)).map(student=>student.id)]));
    const input={className:getActiveClass().nome,start,end,students,effectiveAbsences,modules:state.modules,freq:state.freq,records:artvacData().artvacRecords||[],excluded:[...document.querySelectorAll('[name="avIncludedDate"]:not(:checked)')].map(item=>item.value),counts:Object.fromEntries(days.map(date=>[date,getClassModuleCountForDate(date)])),pointSentAt:document.getElementById('avPointSent').value};
    const report=ArtvacReport.build(input);
    artvacDraft={report,fingerprint:plannerDataFingerprint(state),classId:getActiveClassId()};
    document.getElementById('avReportContent').innerHTML=ArtvacReport.render(report);
    const configured=!!artvacConfig();
    document.getElementById('avServiceStatus').textContent=configured?'Serviço de publicação configurado neste navegador.':'Publicação por link ainda não configurada. PDF e texto para WhatsApp estão disponíveis.';
    button.disabled=!configured||!report.ready||artvacPublishing;
    button.textContent=days.length===5&&new Date(start+'T12:00:00').getDay()===1?'Publicar semana para a ARTVAC':'Publicar período para a ARTVAC';
    const records=artvacData().artvacRecords||[],h=ArtvacReport.escape;
    document.getElementById('avRecordList').innerHTML=records.filter(record=>record.date>=start&&record.date<=end).map(record=>`<div style="display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><span style="flex:1">${h(artvacStudents().find(student=>student.id===record.studentId)?.name||'Aprendiz')} · ${h(ArtvacReport.formatDate(record.date))} · ${h({atraso:'Atraso',saida:'Saída antecipada',justificativa:'Justificativa'}[record.type])} ${h(record.time||'')}</span><button class="btn btn-outline" data-av-remove="${h(record.id)}">Excluir</button></div>`).join('')||'<p>Nenhum registro adicional neste período.</p>';
    document.querySelectorAll('[data-av-remove]').forEach(node=>node.addEventListener('click',()=>deleteArtvacRecord(node.dataset.avRemove)));
    const saved=artvacLinkMap()[artvacOwner+'_'+artvacPeriodKey()];
    const channel=artvacChannelMap()[artvacOwner];
    document.getElementById('avPublicationStatus').innerHTML=(saved?`<p>Última publicação confirmada em ${h(new Date(saved.publishedAt).toLocaleString('pt-BR'))}.</p>`:'<p>Nenhuma publicação confirmada neste navegador para este período.</p>')+((saved||channel)?'<button class="btn btn-outline" onclick="copyArtvacPublishedLink()">Copiar link de consulta da turma</button>':'');
  }catch(error){document.getElementById('avReportContent').textContent=error.message;}
}
function checkedArtvacDraft(){assertArtvacOwner();if(!artvacDraft||artvacDraft.classId!==getActiveClassId()||artvacDraft.fingerprint!==plannerDataFingerprint(state))throw Error('Gere uma nova prévia antes de continuar.');return artvacDraft.report;}
async function copyArtvacText(){try{await navigator.clipboard.writeText(ArtvacReport.message(checkedArtvacDraft()));showToast('Texto copiado. Confira antes de enviar.');}catch(error){showToast(error.message,true);}}
function printArtvacReport(){
  try{
    const report=checkedArtvacDraft(),popup=window.open('','_blank');if(!popup)throw Error('Permita a abertura da janela de impressão.');
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório ARTVAC</title><style>${ArtvacReport.printStyle}</style></head><body>${ArtvacReport.render(report)}</body></html>`);popup.document.close();
    popup.onload=()=>{popup.focus();popup.print();};
  }catch(error){showToast(error.message,true);}
}
function openArtvacRecord(){
  try{
    assertArtvacOwner();const students=artvacStudents();if(!students.length)throw Error('Cadastre os alunos desta turma primeiro.');
    const {start}=artvacRange();
    productivityOverlay('Registro destinado à ARTVAC',productivitySelect('avStudent','Aprendiz',students.map(student=>[student.id,student.name]))+
      `<label class="form-group">Data<input class="form-input" id="avRecordDate" type="date" value="${start}"></label>`+
      productivitySelect('avType','Ocorrência',[['atraso','Atraso'],['saida','Saída antecipada'],['justificativa','Justificativa / documento']])+
      `<label class="form-group">Horário (atraso ou saída)<input class="form-input" type="time" id="avTime"></label>`+
      productivitySelect('avJustification','Situação da justificativa',[['nao_informada','Não informada'],['informada','Justificativa informada'],['aguardando','Aguardando documento'],['apresentado','Documento apresentado']])+
      productivitySelect('avDocument','Tipo de documento',[['','Não especificado'],['atestado','Atestado'],['declaracao','Declaração'],['outro','Outro documento']])+
      `<label class="form-group">Observação para a empresa (sem dados médicos)<textarea class="form-input" maxlength="240" id="avExternalNote"></textarea></label>`,'<button class="btn btn-primary" onclick="saveArtvacRecord()">Salvar registro</button>');
  }catch(error){showToast(error.message,true);}
}
function saveArtvacRecord(){
  try{
    assertArtvacOwner();assertProductivityClass();const studentId=document.getElementById('avStudent').value,date=chatImportDate(document.getElementById('avRecordDate').value),type=document.getElementById('avType').value,time=document.getElementById('avTime').value;
    if(!artvacStudents().some(student=>student.id===studentId))throw Error('Aprendiz não encontrado nesta turma.');
    const range=artvacRange();if(date<range.start||date>range.end||![1,2,3,4,5].includes(new Date(date+'T12:00:00').getDay()))throw Error('Escolha um dia útil dentro do período do relatório.');
    if(![...document.querySelectorAll('[name="avIncludedDate"]:checked')].some(input=>input.value===date))throw Error('Este dia está marcado como sem aula. Confira os dias de aula antes de registrar a ocorrência.');
    if(!['atraso','saida','justificativa'].includes(type))throw Error('Tipo de ocorrência inválido.');
    if(type!=='justificativa'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Informe o horário da entrada ou saída.');
    const record={id:crypto.randomUUID(),studentId,date,type,time:type==='justificativa'?'':time,justification:document.getElementById('avJustification').value,document:document.getElementById('avDocument').value,note:document.getElementById('avExternalNote').value.trim()};
    if((artvacData().artvacRecords||[]).some(item=>item.studentId===studentId&&item.date===date&&item.type===type&&item.time===record.time))throw Error('Este registro já existe. Exclua o anterior para corrigi-lo.');
    if(commitProductivity('registro para a ARTVAC',()=>{const data=artvacData();data.artvacRecords=[...(data.artvacRecords||[]),record];})){closeProductivity();renderArtvacPreview();showToast('Registro salvo, sem alterar a chamada.');}
  }catch(error){showToast(error.message,true);}
}
function deleteArtvacRecord(id){try{assertArtvacOwner();if(confirm('Excluir este registro destinado à ARTVAC?')&&commitProductivity('exclusão de registro ARTVAC',()=>{artvacData().artvacRecords=(artvacData().artvacRecords||[]).filter(record=>record.id!==id);})){renderArtvacPreview();}}catch(error){showToast(error.message,true);}}
function openArtvacSettings(){
  const config=artvacConfig()||{},h=ArtvacReport.escape;
  productivityOverlay('Configurar publicação ARTVAC',`<p style="margin-bottom:14px">O link exige o serviço separado de publicação. A chave de publicação fica apenas neste navegador; não é incluída no relatório nem enviada à ARTVAC.</p><label class="form-group">URL do serviço ARTVAC<input class="form-input" id="avEndpoint" type="url" value="${h(config.endpoint||'')}"></label><label class="form-group">Chave de publicação<input class="form-input" id="avSecret" type="password" autocomplete="off" value="${h(config.secret||'')}"></label><a href="ARTVAC-INSTALACAO.md" target="_blank" rel="noopener">Instruções da configuração inicial</a>`,'<button class="btn btn-primary" id="avSaveConfig" onclick="saveArtvacSettings()">Verificar e salvar</button>');
}
async function artvacCall(config,body){
  if(!artvacEndpointValid(config?.endpoint))throw Error('Use a URL /exec do serviço ARTVAC separado, não a sincronização do Planner.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const healthResponse=await fetch(config.endpoint+'?action=health&t='+Date.now(),{signal:controller.signal,cache:'no-store'});
    if(!healthResponse.ok)throw Error('Serviço ARTVAC indisponível.');
    const health=await healthResponse.json();
    if(!health.ok||health.service!=='artvac-v1')throw Error('Este endereço não é o serviço ARTVAC. Nenhuma chave ou relatório foi enviado.');
    const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,secret:config.secret}),signal:controller.signal,redirect:'follow',cache:'no-store'});
    if(!response.ok)throw Error('Serviço indisponível.');const result=await response.json();if(!result.ok||result.service!=='artvac-v1')throw Error(result.error==='unauthorized'?'Chave de publicação inválida.':'O serviço não confirmou a operação.');return result;
  }finally{clearTimeout(timer);}
}
async function saveArtvacSettings(){
  const button=document.getElementById('avSaveConfig');button.disabled=true;
  try{
    assertArtvacOwner();assertProductivityClass();const config={endpoint:document.getElementById('avEndpoint').value.trim(),secret:document.getElementById('avSecret').value.trim()};
    await artvacCall(config,{action:'check'});localStorage.setItem('artvac_service_v1',JSON.stringify(config));closeProductivity();renderArtvacPreview();showToast('Serviço verificado. A chave não será compartilhada.');
  }catch(error){showToast('Configuração não confirmada: '+error.message,true);}finally{button.disabled=false;}
}
async function publishArtvacReport(){
  if(artvacPublishing)return;
  try{
    const report=checkedArtvacDraft();if(!report.ready)throw Error('Confirme todas as chamadas do período antes de publicar.');const config=artvacConfig();if(!config)throw Error('Configure o serviço de publicação primeiro.');
    const classId=artvacOwner,periodKey=artvacPeriodKey();
    if(!confirm('Publicar os nomes, frequência e registros externos deste período? Qualquer pessoa com o link poderá consultar. Notas, observações internas e documentos anexados não serão enviados.'))return;
    artvacPublishing=true;document.getElementById('avPublish').disabled=true;
    const result=await artvacCall(config,{action:'publish',classId,report});
    if(!/^[a-f0-9]{64}$/.test(result.token||''))throw Error('O serviço não retornou um link válido.');
    const url='https://sbiancandrade30.github.io/planejamento-aulas/artvac.html#'+new URLSearchParams({endpoint:config.endpoint,token:result.token}).toString();
    artvacTransientLinks[classId+'_'+periodKey]={url,classId,publishedAt:result.publishedAt};artvacTransientChannels[classId]={url};
    const persisted=artvacStore('artvac_links_v1',artvacLinkMap())&&artvacStore('artvac_channels_v1',artvacChannelMap());
    artvacPublishing=false;renderArtvacPreview();showToast(persisted?'Publicação confirmada. O link está em Publicação deste período.':'Publicação confirmada. O histórico local não pôde ser salvo; copie o link antes de fechar esta aba.');
  }catch(error){showToast('Publicação não confirmada: '+error.message,true);}finally{finishArtvacOperation();}
}
async function copyArtvacPublishedLink(){try{assertArtvacOwner();const saved=artvacLinkMap()[artvacOwner+'_'+artvacPeriodKey()]||artvacChannelMap()[artvacOwner];if(!saved)throw Error('Nenhum link confirmado neste navegador.');await navigator.clipboard.writeText(saved.url);showToast('Link de consulta copiado.');}catch(error){showToast(error.message,true);}}
async function withdrawArtvacPublication(){
  if(artvacPublishing)return;
  try{assertArtvacOwner();if(!artvacConfig())throw Error('Configure o serviço primeiro.');const classId=artvacOwner,range=artvacRange(),periodKey=artvacPeriodKey();if(!confirm('Retirar este período do acesso da ARTVAC? Os registros do Planner serão mantidos.'))return;artvacPublishing=true;await artvacCall(artvacConfig(),{action:'withdraw',classId,...range});artvacTransientLinks[classId+'_'+periodKey]=null;const persisted=artvacStore('artvac_links_v1',artvacLinkMap());renderArtvacPreview();showToast(persisted?'Publicação retirada.':'Publicação retirada; o histórico local não pôde ser atualizado.');}catch(error){showToast('Retirada não confirmada: '+error.message,true);}finally{finishArtvacOperation();}
}
async function rotateArtvacLink(){
  if(artvacPublishing)return;
  try{
    assertArtvacOwner();const config=artvacConfig();if(!config)throw Error('Configure o serviço primeiro.');const classId=artvacOwner;
    if(!confirm('Invalidar o link antigo da turma inteira? Depois envie o novo link à ARTVAC.'))return;
    artvacPublishing=true;const result=await artvacCall(config,{action:'rotate',classId});if(!/^[a-f0-9]{64}$/.test(result.token||''))throw Error('Link não confirmado.');
    const url='https://sbiancandrade30.github.io/planejamento-aulas/artvac.html#'+new URLSearchParams({endpoint:config.endpoint,token:result.token}).toString();
    artvacTransientChannels[classId]={url};
    Object.entries(artvacLinkMap()).forEach(([key,value])=>{if(value.classId===classId||key.slice(0,-22)===classId)artvacTransientLinks[key]={...value,url};});
    const persisted=artvacStore('artvac_channels_v1',artvacChannelMap())&&artvacStore('artvac_links_v1',artvacLinkMap());
    renderArtvacPreview();showToast(persisted?'Link anterior invalidado. Copie o link atualizado.':'Link anterior invalidado. Copie o novo link antes de fechar esta aba; o histórico local não pôde ser salvo.');
  }catch(error){showToast('Troca de link não confirmada: '+error.message,true);}finally{finishArtvacOperation();}
}
