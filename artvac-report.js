(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
  const dateKey=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  function dates(start,end){
    for(const key of [start,end]){const date=new Date(key+'T12:00:00');if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(+date)||dateKey(date)!==key)throw Error('Informe datas válidas.');}
    if(end<start||(+new Date(end+'T12:00:00')-new Date(start+'T12:00:00'))/86400000>92)throw Error('Escolha um período de até 93 dias.');
    const result=[];for(let day=new Date(start+'T12:00:00');dateKey(day)<=end;day.setDate(day.getDate()+1))if(day.getDay()>0&&day.getDay()<6)result.push(dateKey(day));
    if(!result.length)throw Error('O período não contém dias úteis.');return result;
  }
  const formatDate=key=>String(key).split('-').reverse().join('/');
  const labels={presente:'Presente',falta:'Falta integral',parcial:'Falta parcial',pendente:'Aguardando chamada',sem_aula:'Sem aula'};
  const docLabels={frequencia:'Justificada na frequência',nao_informada:'Não informada',informada:'Justificativa informada',aguardando:'Aguardando documento',apresentado:'Documento apresentado'};
  const eventLabels={atraso:'Atraso',saida:'Saída antecipada',justificativa:'Justificativa'};
  function confirmed(entry){return !!entry?.confirmedAt&&entry.confirmedSignature===JSON.stringify(entry.alunos||{});}
  function build(input){
    const days=dates(input.start,input.end),excluded=new Set(input.excluded||[]),records=input.records||[],students=input.students||[];
    if(days.every(date=>excluded.has(date)))throw Error('Mantenha ao menos um dia de aula no período.');
    if(new Set(students.map(student=>normalize(student.name))).size!==students.length)throw Error('Há nomes de aprendizes duplicados. Confira o cadastro antes de gerar o relatório.');
    const summary={students:students.length,absentStudents:0,absences:0,justified:0,late:0,early:0,pendingCells:0};
    const result={version:1,company:'ARTVAC',className:String(input.className||''),start:input.start,end:input.end,generatedAt:input.now||new Date().toISOString(),pointSentAt:input.pointSentAt||'',days,summary,students:[]};
    result.students=students.map(student=>{
      const name=String(student.name||''),key=normalize(name);
      const cells=days.map(date=>{
        if(excluded.has(date))return {date,status:'sem_aula',absent:0,justified:0,expected:0,justification:'nao_informada',events:[]};
        const count=Number(input.counts?.[date])||6;
        if(!Number.isInteger(count)||count<1||count>8)throw Error('Quantidade de módulos inválida para '+formatDate(date)+'.');
        const entries=Object.entries(input.freq||{}).filter(([,byDate])=>byDate?.[date]).map(([disc,byDate])=>({disc,entry:byDate[date]}));
        const statuses=[];
        for(let index=1;index<=count;index++){
          const planned=input.modules?.[date+'_'+index]?.disc;
          const sources=planned?entries.filter(source=>source.disc===planned):entries;
          const values=sources.map(source=>{
            if(!confirmed(source.entry))return '';
            const row=Object.entries(source.entry.alunos||{}).find(([nome])=>normalize(nome)===key)?.[1];
            if(input.effectiveAbsences?.[date]?.includes(student.id)&&row?.mods?.[index-1]!=='CJ')return '';
            return ['P','CJ','SJ'].includes(row?.mods?.[index-1])?row.mods[index-1]:'';
          });
          statuses.push(values.length&&values.every(value=>value&&value===values[0])?values[0]:'');
        }
        const absent=statuses.filter(status=>status==='CJ'||status==='SJ').length,justified=statuses.filter(status=>status==='CJ').length;
        const pending=statuses.some(status=>!status),status=pending?'pendente':absent===count?'falta':absent?'parcial':'presente';
        const notes=records.filter(record=>record.studentId===student.id&&record.date===date);
        const justification=notes.filter(record=>record.type==='justificativa').at(-1)?.justification||(absent&&justified===absent?'frequencia':'nao_informada');
        const events=notes.map(record=>({type:record.type,time:record.time||'',justification:record.justification||'nao_informada',document:record.document||'',note:record.note||''}));
        if(pending)summary.pendingCells++;
        if(!pending&&absent){summary.absences++;if(justified===absent)summary.justified++;}
        summary.late+=events.filter(event=>event.type==='atraso').length;
        summary.early+=events.filter(event=>event.type==='saida').length;
        return {date,status,absent:pending?0:absent,justified:pending?0:justified,expected:count,justification,events};
      });
      if(cells.some(cell=>cell.status==='falta'||cell.status==='parcial'))summary.absentStudents++;
      return {name,days:cells};
    });
    result.ready=!!students.length&&!summary.pendingCells;
    return result;
  }
  function render(report){
    const h=escape,summary=report.summary;
    return `<section class="av-report${report.days.length>10?' av-long-period':''}"><header class="av-report-head"><div><span class="av-eyebrow">ARTVAC · Acompanhamento dos aprendizes</span><h2>${h(report.className)}</h2><p>${h(formatDate(report.start))} a ${h(formatDate(report.end))}</p></div><span class="av-state">${report.ready?'Período conferido':'Prévia · registros incompletos'}</span></header>
      <div class="av-kpis">${[[summary.absentStudents,'Aprendizes com faltas'],[summary.justified,'Faltas justificadas · aluno/dia'],[summary.late,'Atrasos'],[summary.early,'Saídas antecipadas']].map(([value,label])=>`<div><strong>${h(value)}</strong><span>${label}</span></div>`).join('')}</div>
      ${summary.pendingCells?`<p class="av-warning">${summary.pendingCells} registros de aluno/dia aguardam chamada completa e confirmada. Eles não foram considerados presença nem ausência.</p>`:''}
      <div class="av-table-wrap av-attendance-grid"><table class="av-table"><thead><tr><th>Aprendiz</th>${report.days.map(date=>`<th>${h(new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short'}))}<br>${h(formatDate(date).slice(0,5))}</th>`).join('')}</tr></thead><tbody>${report.students.map(student=>`<tr><th>${h(student.name)}</th>${student.days.map(cell=>`<td><span class="av-status av-${h(cell.status)}">${labels[cell.status]||'Não informado'}</span>${cell.events.filter(event=>event.type!=='justificativa').map(event=>`<small>${eventLabels[event.type]||'Registro'} ${h(event.time)}</small>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <h3>Ocorrências no período</h3><div class="av-table-wrap"><table class="av-table av-details"><thead><tr><th>Aprendiz</th><th>Data</th><th>Ocorrência</th><th>Justificativa / informação destinada à empresa</th></tr></thead><tbody>${occurrenceRows(report).map(row=>`<tr><td>${h(row.name)}</td><td>${h(formatDate(row.date))}</td><td>${h(row.label)}</td><td>${h(row.justification)}</td></tr>`).join('')||'<tr><td colspan="4">Nenhuma ocorrência registrada nos dias com chamada confirmada.</td></tr>'}</tbody></table></div>
      <p class="av-foot">${report.pointSentAt?'Folhas de ponto enviadas em '+h(formatDate(report.pointSentAt))+'.':'Envio das folhas de ponto não registrado.'} Atualizado em ${h(new Date(report.publishedAt||report.generatedAt).toLocaleString('pt-BR'))}.</p></section>`;
  }
  function occurrenceRows(report){
    const rows=[];
    report.students.forEach(student=>student.days.forEach(cell=>{
      if(cell.status==='falta'||cell.status==='parcial')rows.push({name:student.name,date:cell.date,label:labels[cell.status]+' · '+cell.absent+'/'+cell.expected+' módulos',justification:docLabels[cell.justification]||'Não informada'});
      cell.events.forEach(event=>rows.push({name:student.name,date:cell.date,label:(eventLabels[event.type]||'Informação')+(event.time?' · '+event.time:''),justification:[docLabels[event.justification]||'',{atestado:'Atestado',declaracao:'Declaração',outro:'Outro documento'}[event.document]||'',event.note].filter(Boolean).join(' · ')}));
    }));return rows;
  }
  function message(report,url){
    const rows=occurrenceRows(report);
    return `Olá! Segue o acompanhamento dos aprendizes da turma ${report.className}, de ${formatDate(report.start)} a ${formatDate(report.end)}.\n\n`+
      (report.ready?'':`PRÉVIA: há ${report.summary.pendingCells} registros de aluno/dia aguardando conferência.\n\n`)+
      (rows.length?rows.map(row=>`${row.name} — ${formatDate(row.date)}: ${row.label}. ${row.justification}.`).join('\n'):'Nenhuma ocorrência registrada nos dias com chamada confirmada.')+
      (report.pointSentAt?'\n\nFolhas de ponto enviadas em '+formatDate(report.pointSentAt)+'.':'')+(url?'\n\nConsultar dashboard: '+url:'');
  }
  const printStyle=`@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#172334;font:11px/1.4 Arial,sans-serif}.av-report-head{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #164194;padding-bottom:12px}.av-report h2{font-size:19px;margin:4px 0}.av-report h3{font-size:13px;margin:18px 0 8px}.av-report p{margin:4px 0}.av-eyebrow,.av-foot{font-size:10px;color:#546275}.av-state{font-size:10px}.av-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:12px 0;border-bottom:1px solid #dbe2e9;margin-bottom:14px}.av-kpis strong{font-size:22px;display:block}.av-kpis span{font-size:10px}.av-warning{border-left:3px solid #b67a10;padding:8px;background:#fff5dc}.av-table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:10px}.av-table th,.av-table td{border:1px solid #dbe2e9;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.av-table th{background:#f3f6fa}.av-table small{display:block;font-size:9px}.av-status{font-size:9px}.av-status:before{content:' ';display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:4px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.av-presente{color:#26734b}.av-falta{color:#af3039}.av-parcial{color:#956512}.av-pendente,.av-sem_aula{color:#697586}.av-foot{margin-top:16px!important}.av-long-period .av-attendance-grid{display:none}thead{display:table-header-group}tr,.av-report-head,.av-kpis{break-inside:avoid}`;
  root.ArtvacReport={build,render,message,dates,escape,formatDate,confirmed,printStyle};
  if(typeof module!=='undefined')module.exports=root.ArtvacReport;
})(typeof window!=='undefined'?window:globalThis);
