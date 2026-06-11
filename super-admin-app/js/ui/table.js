/**
 * table.js — Reusable data table builder.
 * Super Admin V2 (ADR-019, §10B): each cell carries `data-label` and an optional card-mode
 * (`opts.cards`) so narrow panes render rows as label/value cards instead of forcing a
 * horizontal scroll (see `.qr-table--cards` in admin-style.css).
 */
var Table = (function () {
  'use strict';

  /**
   * Build a responsive data table.
   * @param {Array} columns - [{ key, label, render? }]
   * @param {Array} data - array of row objects
   * @param {Function} actionsRenderer - optional, receives row, returns DOM element
   * @param {Object} opts - optional, { cards: bool } → enable card-mode at narrow widths
   * @returns {HTMLElement}
   */
  function build(columns, data, actionsRenderer, opts) {
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap' + (opts && opts.cards ? ' qr-table--cards' : '');

    var table = document.createElement('table');
    table.className = 'data-table';

    // Thead
    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    columns.forEach(function (col) {
      var th = document.createElement('th');
      th.textContent = col.label;
      trHead.appendChild(th);
    });
    if (actionsRenderer) {
      var thA = document.createElement('th');
      thA.textContent = 'Actions';
      trHead.appendChild(thA);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    // Tbody
    var tbody = document.createElement('tbody');
    if (!data || data.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = columns.length + (actionsRenderer ? 1 : 0);
      td.className = 'empty-state';
      td.innerHTML = '<div class="empty-state-icon">📋</div><div class="empty-state-text">No data available</div>';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      data.forEach(function (row) {
        var tr = document.createElement('tr');
        columns.forEach(function (col) {
          var td = document.createElement('td');
          td.setAttribute('data-label', col.label || '');
          if (col.render) {
            td.innerHTML = col.render(row[col.key], row);
          } else {
            td.textContent = row[col.key] != null ? row[col.key] : '–';
          }
          tr.appendChild(td);
        });
        if (actionsRenderer) {
          var tdA = document.createElement('td');
          tdA.setAttribute('data-label', 'Actions');
          tdA.appendChild(actionsRenderer(row));
          tr.appendChild(tdA);
        }
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  return { build: build };
})();
