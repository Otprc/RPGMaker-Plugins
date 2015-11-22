//=============================================================================
/*:
 * @plugindesc Card System
 * @author BlackRaison
 *
 * @param Maximum Battler Cards
 * @desc Removes the encounter message at the beginning of a battle, 0 true 1 false
 * Default: 30
 * @default 30
 *
 * @param Minimum Battler Cards
 * @desc Define the maximum value the atb counter can reach
 * Default: 30
 * @default 30
 *
 * @param Shuffle State Id
 * @desc The index of the state that is defined to be shuffle (You must create it)
 * Default: 11
 * @default 11
 *
 * @param Using Atb
 * @desc fixes some problems with atb systems
 * Default: false
 * @default false
 *
 * @param Using Yanfly Battle Core
 * @desc fixes some problems with atb systems
 * Default: false
 * @default false
 *
 */

(function(){
	var BlkRaison = BlkRaison || {};

	BlkRaison.Parameters = PluginManager.parameters('CardSystem');
	BlkRaison.Param = BlkRaison.Param || {};

	BlkRaison.Param.MaxBC = Number(BlkRaison.Parameters['Maximum Battler Cards']);
	BlkRaison.Param.MinBC = Number(BlkRaison.Parameters['Minimum Battler Cards']);
	BlkRaison.Param.ShuffleStateId = Number(BlkRaison.Parameters['Shuffle State Id']);
	BlkRaison.Param.UsingAtb = String(BlkRaison.Parameters['Using Atb']);
	BlkRaison.Param.UsingYBCE = String(BlkRaison.Parameters['Using Yanfly Battle Core']);

	Scene_Boot.prototype.isReady = function() {
	    if (Scene_Base.prototype.isReady.call(this)) {
	        if (DataManager.isDatabaseLoaded() && this.isGameFontLoaded()){
	        	DataManager.makeCardList();
	        	return true;
	        }
	    }
	    return false;
	};

	DataManager.makeCardList = function(){
		this._cardTypes = [];
		$dataItems.forEach(function(item){
			if (item != null){
				if (item.meta.card != null){
					var ct = item.note.match(/<(?:Card Type):[ ]*(\w+\s*)>/i);
					var val;
					if (ct){
						val = RegExp.$1.match(/\w+/g)[0];
					}
					else{
						val = "Default";
					}
					if (this._cardTypes.length == 0){
						this._cardTypes.push(val);
					}
					else{
						var hasduplicate = false;
						for (var i = 0; i < this._cardTypes.length; i++){
							if (this._cardTypes[i] === val){
								hasduplicate = true;
								break;
							}
						}
						if (!hasduplicate){
							this._cardTypes.push(val);
						}
					}
				}
			}
		}, this);

		this._cardTypes.sort(function(a,b){
			return a - b;
		});
	};

	_BLKR_Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
	Game_Interpreter.prototype.pluginCommand = function(command, args) {
		_BLKR_Game_Interpreter_pluginCommand.call(this, command, args);
	    if (command == "CardSystem.GiveStarterCards"){
	    	var target = $gameParty.members()[$gameParty._actors.indexOf(eval(args.shift()))];
	    	target._deckList = [];
	    	args.forEach(function(id){
	    		var item = $dataItems[id];
	    		if (item.meta){
	    			if (item.meta.card){
	    				target._deckList.push(item);
	    			}
	    		}
	    	});
	    }

	    if (command == "CardSystem.GiveCards"){
	    	args.forEach(function(id){
	    		var item = $dataItems[id];
	    		if (item.meta){
	    			if (item.meta.card){
	    				$gameParty.gainItem(item,1);
	    			}
	    		}
	    	});
	    }

	    if (command == "CardSystem.ChangeClass"){
	    	var target = $gameParty.members()[$gameParty._actors.indexOf(eval(args.shift()))];
	    	var classId = eval(args.shift());
	    	target._deckList.forEach(function(card){
	    		$gameParty.gainItem(card,1);
	    	});
	    	target._deckList = [];
	    	args.forEach(function(id){
	    		var item = $dataItems[id];
	    		if (item.meta){
	    			if (item.meta.card){
	    				target._deckList.push(item);
	    			}
	    		}
	    	});
	    	target.changeClass(classId, true);
	    }
	};

	Game_BattlerBase.prototype.meetsItemConditions = function(item) {
		if (item.meta.card != null && this.isActor()){
			return true;
		}
	    return this.meetsUsableItemConditions(item) && $gameParty.hasItem(item);
	};

	Game_Actor.prototype.changeClass = function(classId, keepExp) {
		if (keepExp) {
	        this._exp[classId] = this._exp[this.currentClass().id];
	    }
	    this._classId = classId;
	    this.changeExp(this._exp[this._classId] || 0, false);
	    this.refresh();
		this.classCompatibility();
	};

	//########################### BATTLE SECTION ################################
	// CARD SYSTEM INTEGRATION WITH BATTLE
	//###########################################################################

	//===========================================================================
	// Battle Core
	//===========================================================================
	_BLKR_Game_Actor_setup = Game_Actor.prototype.setup;
	Game_Actor.prototype.setup = function(actorId) {
		_BLKR_Game_Actor_setup.call(this,actorId);
		this.initCardSystem();
	};

	Game_Actor.prototype.refreshActorCards = function(){
		this._battleDeck = [];
		this._battleHand = [];
		this._cardQueue = [];
		this._cardSelectionOrder = [];
		this._cardQueueLimit = 3;
		this._shuffling = false;
	};

	Game_Actor.prototype.initCardSystem = function(){
		this._deckList = [];
		this._battleDeck = [];
		this._battleHand = [];
		this._cardQueue = [];
		this._shuffling = false;
		this.classCompatibility();
	};

	Game_Actor.prototype.classCompatibility = function(){
		this._compatibleCardTypes = [];
		var ct = this.currentClass().note.match(/<(?:Card Type):[ ]*(\w+(,|>)\s*)+/i);
		if(ct){
			var arr = RegExp.$1.match(/\w+/g);
			
			arr.forEach(function(type){
				var ltype = type.toLowerCase();
				if (DataManager._cardTypes.indexOf(ltype) > -1){
					this._compatibleCardTypes.push(ltype);
				}
			},this);
			this._compatibleCardTypes.sort(function(a,b){
				return a - b;
			});
		}
	};

	Game_Actor.prototype.onTurnEnd = function() {
	    this.clearResult();
	    this.regenerateAll();
	    this.updateStateTurns();
	    this.updateBuffTurns();
	    this.removeStatesAuto(2);
	};

	Game_Actor.prototype.shuffleDeck = function(){
		if ($gameParty.inBattle()){
			this._battleHand = [];
			this._battleDeck = [];
			this._deckList.forEach(function(entry){
				this._battleDeck.push(entry);
			}, this);
		
			for(var j, x, i = this._battleDeck.length; i; j = Math.floor(Math.random() * i), x = this._battleDeck[--i], this._battleDeck[i] = this._battleDeck[j], this._battleDeck[j] = x);
			this.drawCards();
		}		
	};

	//Fill the battler's deck with the cards
	_BLKR_Game_Actor_onBattleStart = Game_Actor.prototype.onBattleStart;
	Game_Actor.prototype.onBattleStart = function() {
		this.refreshActorCards();
		this.shuffleDeck();
		_BLKR_Game_Actor_onBattleStart.call(this);
	}

	Game_Actor.prototype.onTurnEnd = function() {
		Game_Battler.prototype.onTurnEnd.call(this);
		if ($gameParty.inBattle()){
	    	this.drawCards();
		}
	}

	Game_Actor.prototype.drawCards = function(){
		if (this._battleDeck.length > 0){
			var drawAmount = 7 - this._battleHand.length;
			this._battleHand = this._battleHand.concat(this._battleDeck.splice(0,drawAmount));
		}
		else if (this._battleHand.length === 0){
			this.shuffleDeck();
			this.addNewState(BlkRaison.Param.ShuffleStateId);
			this._shuffling = true;
		}
	};

	Game_Unit.prototype.onBattleStart = function() {
		this._inBattle = true;
	    this.members().forEach(function(member) {
	        member.onBattleStart();
	    });
	};

	Game_Action.prototype.setIndex = function(index){
		this._index = index;
	};

	Game_Party.prototype.checkForShuffleState = function() {
		this.battleMembers().forEach(function (actor){
			if (actor._shuffling){
				actor._shuffling = false;
				actor.removeState(BlkRaison.Param.ShuffleStateId);
			}
		});
	};

	_BLKR_BattleManager_processTurn = BattleManager.processTurn;
	BattleManager.processTurn = function() {
		_BLKR_BattleManager_processTurn.call(this);	
	};

	_BLKR_BattleManager_endTurn = BattleManager.endTurn;
	BattleManager.endTurn = function() {
	    $gameParty.checkForShuffleState();
	    _BLKR_BattleManager_endTurn.call(this);
	};

	_BLKR_BattleManager_endAction = BattleManager.endAction;
	BattleManager.endAction = function() {
	    _BLKR_BattleManager_endAction.call(this);
	    if (this._subject.isActor()){
		    this._subject._actionInputIndex--;
		    this._subject._cardSelectionOrder.shift();
	    }
	};

	//=========================================================================================
	// ENEMY AI
	//=========================================================================================

	_BLKR_Game_Enemy_setup = Game_Enemy.prototype.setup;
	Game_Enemy.prototype.setup = function(enemyId, x, y){
		_BLKR_Game_Enemy_setup.call(this,enemyId,x,y);
		this._cardQueueLimit = 0;
		if (this.enemy().meta){
			this._cardQueueLimit = this.enemy().meta.card_limit;
		}
		if (!this._cardQueueLimit){
			this._cardQueueLimit = 1;
		}
		this._movementCounter = -1;
	};

	Game_Battler.prototype.makeActionTimes = function() {
		if (this.isEnemy()){
			this._movementCounter = this._cardQueueLimit + 1;
		}
		return this._cardQueueLimit;
	};
 
	//==========================================================================================
	// START OF UI
	//==========================================================================================
	Window_ActorCommand.prototype.makeCommandList = function() {
	    if (this._actor) {
	        this.addAttackCommand();
	        this.addGuardCommand();
	        this.addItemCommand();
	    }
	};

	_BLKR_Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
	Scene_Battle.prototype.createAllWindows = function() {
		_BLKR_Scene_Battle_createAllWindows.call(this);
		this.createActorBattleHandWindow();
	};

	Scene_Battle.prototype.createActorBattleHandWindow = function() {
		this._actorBattleHandWindow = new Window_ActorBattleHand(0,this._statusWindow.y - this._statusWindow.height/2,Graphics.width, this._statusWindow.height/2);
		this._actorBattleHandWindow.setHandler('ok',     this.onCardOk.bind(this));
    	this._actorBattleHandWindow.setHandler('cancel', this.onCardCancel.bind(this));
		this.addWindow(this._actorBattleHandWindow);
	};

	Scene_Battle.prototype.onCardOk = function(){
		var index = this._actorBattleHandWindow.index();
		var actor = BattleManager.actor();
		var card = this._actorBattleHandWindow.item();
		var action = BattleManager.inputtingAction();
		action.setItem(card.id);
		//remove item from hand
		actor._battleHand.splice(index,1);
		//To pop the cards later into the correct spot
		actor._cardSelectionOrder.push(index);
		//Prevents selecting of non-existant index
		if (index > actor._battleHand.length - 1){
			index--;
		}

		if (BlkRaison.Param.UsingYBCE === 'true'){
			this._helpWindow.setActor(actor);
			this._actorWindow.setActor(actor);
			BattleManager.stopAllSelection();
		}

		this._actorBattleHandWindow.select(index);
		this.onSelectAction();
	};


	Scene_Battle.prototype.onCardCancel = function(){
		var actor = BattleManager.actor();
		if (actor._cardSelectionOrder.length > 0){
			actor.selectPreviousCommand();
			actor._actionInputIndex = actor._cardSelectionOrder.length - 1;
			var card = actor._actions[actor._cardSelectionOrder.length - 1];
			var index = actor._cardSelectionOrder.pop();
			actor._battleHand.splice(index,0,$dataItems[card._item._itemId]);
			this._actorBattleHandWindow.refresh();
			this._actorBattleHandWindow.activate();
			this._actorBattleHandWindow.select(index);
			this._actorBattleHandWindow.show();
		}
		else{
			this._actorBattleHandWindow.activate();
			this.selectPreviousCommand();
		}
	};

	Scene_Battle.prototype.commandGuard = function() {
	    BattleManager.inputtingAction().setGuard();
	    BattleManager.updateTurn();
	};

	Scene_Battle.prototype.selectMoreCards = function() {
		var actor = BattleManager.actor();
    	if (actor._actionInputIndex < actor._cardQueueLimit-1){
    		this._actorBattleHandWindow.refresh();
    		this._actorBattleHandWindow.show();
    		this._actorBattleHandWindow.activate();
    		this._actorBattleHandWindow.select(this._actorBattleHandWindow.index());
    	}
	}

 	Scene_Battle.prototype.selectNextCommand = function() {
 		if (BattleManager._actorIndex > -1){
	    	this.selectMoreCards();
	    	BattleManager.selectNextCommand();
	    }
	    else{
	    	BattleManager.selectNextCommand();
	    	 this.changeInputWindow();
	    }
	};

	Scene_Battle.prototype.selectPreviousCommand = function() {
		if (this._actorBattleHandWindow.isOpenAndActive()){
			this._actorBattleHandWindow.deactivate();
			this._actorBattleHandWindow.hide();
		}
		else{
			if (BlkRaison.Param.UsingAtb !== 'true'){
		    	BattleManager.selectPreviousCommand();
		    	if (BattleManager.actor()){
		    		this._statusWindow.select(BattleManager.actor().index());
		    		this._actorBattleHandWindow.setActor(BattleManager.actor());
		    		this.onCardCancel();
		    		this._actorBattleHandWindow.activate();
		    		this._actorBattleHandWindow.show();
		    	}
		    }
		}
	};

	_BLKR_Scene_Battle_onSelectAction = Scene_Battle.prototype.onSelectAction;
	Scene_Battle.prototype.onSelectAction = function() {
	    this._actorBattleHandWindow.hide();
	    _BLKR_Scene_Battle_onSelectAction.call(this)

	};

	Scene_Battle.prototype.commandAttack = function() {
	    this._actorBattleHandWindow.setActor(BattleManager.actor());
	    this._actorBattleHandWindow.refresh();
	    this._actorBattleHandWindow.show();
	    this._actorBattleHandWindow.activate();
	    this._actorBattleHandWindow.select(0);
	};

	Scene_Battle.prototype.onEnemyOk = function() {
	    //var action = BattleManager.inputtingAction();
	    var actor = BattleManager.actor();
	    var action = BattleManager.inputtingAction();
	    action.setTarget(this._enemyWindow.enemyIndex());
	    this._enemyWindow.hide();
	    this._skillWindow.hide();
	    this._itemWindow.hide();
	    this.selectMoreCards();
	    this.selectNextCommand();

	    if (BlkRaison.Param.UsingYBCE === 'true'){
	    	BattleManager.stopAllSelection();
	    }
	};

	Scene_Battle.prototype.onEnemyCancel = function() {

		if (BlkRaison.Param.UsingYBCE === 'true'){
			BattleManager.stopAllSelection();
			this._helpWindow.hide();
		}
	    this._enemyWindow.hide();
	    switch (this._actorCommandWindow.currentSymbol()) {
	    case 'attack':
	        this.onCardCancel();
	        break;
	    case 'skill':
	        this._skillWindow.show();
	        this._skillWindow.activate();
	        break;
	    case 'item':
	        this._itemWindow.show();
	        this._itemWindow.activate();
	        break;
	    }
	};

	Scene_Battle.prototype.onActorOk = function() {
	    var actor = BattleManager.actor();
	    var queueLength = actor._actions.length - 1;
	    var action = BattleManager.inputtingAction();
	    action.setTarget(this._actorWindow.index());
	    this._actorWindow.hide();
	    this._skillWindow.hide();
	    this._itemWindow.hide();
	    this.selectMoreCards();
	    this.selectNextCommand();
	    if (BlkRaison.Param.UsingYBCE === 'true'){
			BattleManager.stopAllSelection();	
			this._helpWindow.hide();
		}
	};

	_BLKR_Scene_Battle_onActorCancel = Scene_Battle.prototype.onActorCancel;
	Scene_Battle.prototype.onActorCancel = function() {
	  	_BLKR_Scene_Battle_onActorCancel.call(this);
	    switch (this._actorCommandWindow.currentSymbol()) {
	    case 'attack':
	    	this.onCardCancel();
	    	break;
	    }
	};

	Scene_Battle.prototype.isAnyInputWindowActive = function() {
	    return (this._partyCommandWindow.active ||
	            this._actorCommandWindow.active ||
	            this._skillWindow.active ||
	            this._itemWindow.active ||
	            this._actorWindow.active ||
	            this._enemyWindow.active ||
	            this._actorBattleHandWindow.active);
	};

	Scene_Battle.prototype.switchToCardWindow = function() {
		this.commandAttack();
	};

	//==========================================================================================
	// END OF UI
	//==========================================================================================
	//##########################################################################################
	// END OF BATTLE SYSTEM
	//##########################################################################################

	function Window_ActorBattleHand() {
	    this.initialize.apply(this, arguments);
	}

	Window_ActorBattleHand.prototype = Object.create(Window_Selectable.prototype);
	Window_ActorBattleHand.prototype.constructor = Window_ActorBattleHand;

	Window_ActorBattleHand.prototype.initialize = function(x, y, width, height) {
	    Window_Selectable.prototype.initialize.call(this, x, y, width, height);
	    this._actor = null;
	    this._data = [];
	    this.hide();
	};

	Window_ActorBattleHand.prototype.setActor = function(actor) {
	    if (this._actor !== actor) {
	        this._actor = actor;
	        this.refresh();
	        this.resetScroll();
	    }
	};

	Window_ActorBattleHand.prototype.maxCols = function() {
	    return 7;
	};

	Window_ActorBattleHand.prototype.maxRows = function() {
		return 1;
	}

	Window_ActorBattleHand.prototype.spacing = function() {
	    return 32;
	};

	Window_ActorBattleHand.prototype.maxItems = function() {
	    return this._data ? this._data.length : 1;
	};

	Window_ActorBattleHand.prototype.item = function() {
	    return this._data && this.index() >= 0 ? this._data[this.index()] : null;
	};

	Window_ActorBattleHand.prototype.makeItemList = function() {
	    if (this._actor) {
	        this._data = [];
	        for (var i = 0; i < this._actor._battleHand.length ; i++){
	        	this._data[i] = this._actor._battleHand[i];
	        }
	    } else {
	        this._data = [];
	    }
	};

	Window_ActorBattleHand.prototype.selectLast = function() {
	    var skill;
	    if ($gameParty.inBattle()) {
	        skill = this._actor.lastBattleSkill();
	    } else {
	        skill = this._actor.lastMenuSkill();
	    }
	    var index = this._data.indexOf(skill);
	    this.select(index >= 0 ? index : 0);
	};

	Window_ActorBattleHand.prototype.drawItem = function(index) {
	    var skill = this._data[index];
	    if (skill) {
	        var costWidth = this.costWidth();
	        var rect = this.itemRectForText(index);
	        rect.width -= this.textPadding();
	        this.drawItemName(skill, rect.x, rect.y, rect.width - costWidth);
	        this.changePaintOpacity(1);
	    }
	};

	Window_ActorBattleHand.prototype.standardFontSize = function() {
	    return 16;
	};

	Window_ActorBattleHand.prototype.drawText = function(text, x, y, maxWidth, align) {
	    this.contents.drawText(text, x, y, maxWidth, this.lineHeight(), align);
	};

	Window_ActorBattleHand.prototype.itemTextAlign = function() {
	    return 'center';
	};

	Window_ActorBattleHand.prototype.drawItemName = function(item, x, y, width) {
	    width = width || 312;
	    if (item) {
	        this.resetTextColor();
	        this.drawIcon(item.iconIndex, x + width/2 - 16, y + 2);
	        this.drawText(item.name, x, this.itemHeight() - 32, width, this.itemTextAlign());
	    }
	};

	Window_ActorBattleHand.prototype.itemHeight = function() {
		return this.lineHeight() * 1.5;
	}

	Window_ActorBattleHand.prototype.costWidth = function() {
	    return this.textWidth('000');
	};

	Window_ActorBattleHand.prototype.drawSkillCost = function(skill, x, y, width) {
	    if (this._actor.skillTpCost(skill) > 0) {
	        this.changeTextColor(this.tpCostColor());
	        this.drawText(this._actor.skillTpCost(skill), x, y, width, 'right');
	    } else if (this._actor.skillMpCost(skill) > 0) {
	        this.changeTextColor(this.mpCostColor());
	        this.drawText(this._actor.skillMpCost(skill), x, y, width, 'right');
	    }
	};

	Window_ActorBattleHand.prototype.refresh = function() {
	    this.makeItemList();
	    this.createContents();
	    this.drawAllItems();
	};

	//##########################################################################################
	// CARD SYSTEM FUNCTIONALITY
	//##########################################################################################
	//Make the black bar appear at the top of the battlelog
	Window_BattleLog.prototype.createBackSprite = function() {
	    this._backSprite = new Sprite();
	    this._backSprite.bitmap = this._backBitmap;
	    this._backSprite.y = 0;
	    this.addChildToBack(this._backSprite);
	};

	//added y arg
	Window_BattleLog.prototype.initialize = function(y) {
	    var width = this.windowWidth();
	    var height = this.windowHeight();
	    Window_Selectable.prototype.initialize.call(this, 0, y, width, height);
	    this.opacity = 0;
	    this._lines = [];
	    this._methods = [];
	    this._waitCount = 0;
	    this._waitMode = '';
	    this._baseLineStack = [];
	    this._spriteset = null;
	    this.createBackBitmap();
	    this.createBackSprite();
	    this.refresh();
	};

	//############################ MENU SECTION #################################
	//===========================================================================
	//===========================================================================
	//Add menu commands for Cards and Edit Deck
	//===========================================================================
	_BLKR_Window_MenuCommand_addMainCommands = Window_MenuCommand.prototype.addMainCommands;
	Window_MenuCommand.prototype.addMainCommands = function() {
		_BLKR_Window_MenuCommand_addMainCommands.call(this);
	    this.addCommand("Cards", 'cards', true);
	    this.addCommand("Edit Deck", 'deck', true);
	};

	Scene_Menu.prototype.createCommandWindow = function() {
	    this._commandWindow = new Window_MenuCommand(0, 0);
	    this._commandWindow.setHandler('item',      this.commandItem.bind(this));
	    this._commandWindow.setHandler('skill',     this.commandPersonal.bind(this));
	    this._commandWindow.setHandler('equip',     this.commandPersonal.bind(this));
	    this._commandWindow.setHandler('status',    this.commandPersonal.bind(this));
	    this._commandWindow.setHandler('formation', this.commandFormation.bind(this));
	    this._commandWindow.setHandler('options',   this.commandOptions.bind(this));
	    this._commandWindow.setHandler('save',      this.commandSave.bind(this));
	    this._commandWindow.setHandler('gameEnd',   this.commandGameEnd.bind(this));
	    this._commandWindow.setHandler('cancel',    this.popScene.bind(this));
	    this._commandWindow.setHandler('deck',		this.commandPersonal.bind(this));
	    this._commandWindow.setHandler('cards',		this.commandPersonal.bind(this));
	    this.addWindow(this._commandWindow);

	};

	_BLKR_Scene_Menu_onPersonalOk = Scene_Menu.prototype.onPersonalOk;
	Scene_Menu.prototype.onPersonalOk = function() {
		_BLKR_Scene_Menu_onPersonalOk.call(this);
	    switch (this._commandWindow.currentSymbol()) {
	    case 'deck':
	    	SceneManager.push(Scene_Deck);
	    	break;
	    case 'cards':
	    	SceneManager.push(Scene_Cards)
	    }

	};

	//===========================================================================
	// Edit Item screen
	//
	// Removes <cards> from the item screen
	//===========================================================================

	Window_ItemList.prototype.includes = function(item) {
	    switch (this._category) {
	    case 'item':
	    if (item != null){
	    }
	        return DataManager.isItem(item) && item.itypeId === 1 && (typeof item.meta.card === "undefined");
	    case 'weapon':
	        return DataManager.isWeapon(item);
	    case 'armor':
	        return DataManager.isArmor(item);
	    case 'keyItem':
	        return DataManager.isItem(item) && item.itypeId === 2;
	    default:
	        return false;
	    }
	};

	//===========================================================================
	// SEGMENT FOR EDIT DECK
	//===========================================================================
	// Scene_Deck
	//
	// The scene class for editing decks
	//===========================================================================

	function Scene_Deck() {
	    this.initialize.apply(this, arguments);
	};

	Scene_Deck.prototype = Object.create(Scene_ItemBase.prototype);
	Scene_Deck.prototype.constructor = Scene_Deck;

	Scene_Deck.prototype.initialize = function() {
	    Scene_ItemBase.prototype.initialize.call(this);
	    this._isInSwap = false;
	};

	Scene_Deck.prototype.create = function() {
	    Scene_ItemBase.prototype.create.call(this);
	    this.createCategoryWindow();
	    this.createDeckEditCommandWindow();
	    this.createHelpWindow();
	    var wy = this._categoryWindow.y + this._categoryWindow.height;
	    var wh = Graphics.boxHeight - wy;
	    var width = Graphics.boxWidth/3;
	    this.createPartyCardsWindow(0,wy,width,wh);
	    this.createActorCardsWindow();
	    this.createCardCounterWindow();
	    this.createActorWindow();
	    this.refreshActor();
	};

	Scene_Deck.prototype.createCategoryWindow = function() {
	    this._categoryWindow = new Window_CardType();
	    //this._categoryWindow.setHelpWindow(this._helpWindow);
	    this._categoryWindow.y = 0;//this._helpWindow.height;
	    this._categoryWindow.setHandler('ok',     this.onCategoryOk.bind(this));
	    this._categoryWindow.setHandler('cancel', this.returnToDeckEdit.bind(this));
	    this._categoryWindow.setHandler('pagedown', this.nextActor.bind(this));
	    this._categoryWindow.setHandler('pageup', this.previousActor.bind(this));
	    this.addWindow(this._categoryWindow);
	    this._categoryWindow.deactivate();
	    this._categoryWindow.deselect();
	};

	Scene_Deck.prototype.createDeckEditCommandWindow = function() {
		this._deckEditCommand = new Window_DeckEditOptions(0,0);
		//this._deckEditCommand.setHelpWindow(this._helpWindow);
		//this._deckEditCommand.setHandler('ok',		this.onCategoryOk.bind(this));
		this._deckEditCommand.setHandler('cancel',	this.popScene.bind(this));
		this._deckEditCommand.setHandler('add',		this.onAdd.bind(this));
		this._deckEditCommand.setHandler('remove',	this.onRemove.bind(this));
		this._deckEditCommand.setHandler('pagedown', this.nextActor.bind(this));
	    this._deckEditCommand.setHandler('pageup', this.previousActor.bind(this));
		this.addWindow(this._deckEditCommand);
	};

	Scene_Deck.prototype.createHelpWindow = function() {
		this._helpWindow = new Window_CardDetails(Graphics.boxWidth/3,this._categoryWindow.height,Graphics.boxWidth/3,(Graphics.height*3/4) - this._categoryWindow.height);
		this._helpWindow.show();
		this.addWindow(this._helpWindow);
	};


	Scene_Deck.prototype.createPartyCardsWindow = function() {
	    var wy = this._categoryWindow.y + this._categoryWindow.height;
	    var wh = Graphics.boxHeight - wy;
	    var width = Graphics.boxWidth/3;
	    this._partyCardsWindow = new Window_PartyCardList(0, wy, width, wh);
	    this._partyCardsWindow.setHelpWindow(this._helpWindow);
	    if (BlkRaison.Param.MaxBC != BlkRaison.Param.MinBC){
	    	this._partyCardsWindow.setHandler('ok',     this.onItemOk.bind(this));
	    }
	    else{
	    	this._partyCardsWindow.setHandler('ok',		this.swapPA.bind(this));
	    }
	   
	    this._partyCardsWindow.setHandler('cancel', this.onItemCancel.bind(this));
	    this.addWindow(this._partyCardsWindow);
	    this._categoryWindow.setItemWindow(this._partyCardsWindow);
	};

	Scene_Deck.prototype.createActorCardsWindow = function() {
		var wy = this._categoryWindow.y + this._categoryWindow.height;
	    var wh = Graphics.boxHeight - wy;
	    var width = Graphics.boxWidth/3;
		this._actorCardsWindow = new Window_ActorCardList(Graphics.boxWidth/3*2,wy,width,wh);
		this._actorCardsWindow.setHelpWindow(this._helpWindow);
		if (BlkRaison.Param.MaxBC != BlkRaison.Param.MinBC){
			this._actorCardsWindow.setHandler('ok',     this.onItemRemove.bind(this));
		}
		else{
			this._actorCardsWindow.setHandler('ok',		this.swapAP.bind(this));
		}
	    this._actorCardsWindow.setHandler('cancel', this.onItemCancel2.bind(this));
		this.addWindow(this._actorCardsWindow);
	};

	Scene_Deck.prototype.createCardCounterWindow = function(){
		var x = this._partyCardsWindow.width;
		var height = Graphics.height / 4;
		var y = Graphics.height - height;
		var width = this._actorCardsWindow.x - x;
		this._actorCardCounter = new Window_ActorCardCounter(x,y,width,height);
		this.addWindow(this._actorCardCounter);
	};

	Scene_Deck.prototype.onActorChange = function() {
	    this.refreshActor();
	    this._deckEditCommand.show();
	    this._deckEditCommand.activate();
	    this._deckEditCommand.select(0);
	    this._helpWindow.contents.clear();
	};

	Scene_Deck.prototype.refreshActor = function() {
	    var actor = this.actor();
	    this._actorCardsWindow.setActor(actor);
	    this._categoryWindow.setActor(actor);
	    this._actorCardCounter.setActor(actor);
	    this._helpWindow.setActor(actor);
	};

	Scene_Deck.prototype.user = function() {
	    return this.actor();
	};

	Scene_Deck.prototype.onAdd = function() {
	    this._deckEditCommand.deactivate();
	    this._deckEditCommand.hide();
	    this._categoryWindow.activate();
	    this._categoryWindow.select(0);
	};

	Scene_Deck.prototype.onRemove = function() {
	    this._deckEditCommand.deactivate();
	    this._deckEditCommand.hide();
	    this._actorCardsWindow.activate();
	    this._actorCardsWindow.select(0);
	};

	Scene_Deck.prototype.returnToDeckEdit = function() {
		this._deckEditCommand.show();
		this._deckEditCommand.activate();
		this._categoryWindow.deselect();
		this._categoryWindow.deactivate();
	}

	Scene_Deck.prototype.swap = function(){
		var itema = this.item(this._actorCardsWindow);
		var itemb = this.item(this._partyCardsWindow);
	    $gameParty.gainItem(itema,1,false);
		this._actorCardsWindow._actor._deckList.splice(this._actorCardsWindow.index(),1);
		$gameParty.loseItem(itemb,1,false);
	    this._actorCardsWindow._actor._deckList.splice(this._actorCardsWindow.index(),0,itemb);
	    this._isInSwap = false;
	    this._partyCardsWindow.refresh();
	    this._actorCardsWindow.refresh();
	}

	Scene_Deck.prototype.swapPA = function() {
		if (this._isInSwap){
			this.swap();
			this._partyCardsWindow.deselect();
		    this._actorCardsWindow.activate();
		}
		else{
			this._isInSwap = true;
			this._actorCardsWindow.activate();
			this._actorCardsWindow.select(0);
		}
	}

	Scene_Deck.prototype.swapAP = function() {
		if (this._isInSwap){
			this.swap();
		    this._partyCardsWindow.activate();
		    this._actorCardsWindow.deselect();
		}
		else{
			this._isInSwap = true;
			this._partyCardsWindow.activate();
			this._partyCardsWindow.select(0);
		}
	}

	Scene_Deck.prototype.onCategoryOk = function() {
	    this._partyCardsWindow.activate();
	    this._partyCardsWindow.selectLast();
	};

	Scene_Deck.prototype.item = function(windows){
		return windows.item();
	};

	Scene_Deck.prototype.onItemOk = function() {
		var item = this.item(this._partyCardsWindow)
		if (this._actorCardsWindow._actor._deckList.length < BlkRaison.Param.MaxBC){
			$gameParty.loseItem(item,1,false);
		    this._actorCardsWindow._actor._deckList.push(item);
		}

		this._partyCardsWindow.refresh();
		this._actorCardsWindow.refresh();
		this._partyCardsWindow.activate();
		this._partyCardsWindow.select(0);
	    
	};

	Scene_Deck.prototype.onItemRemove = function() {
		if (this._actorCardsWindow._actor._deckList.length - 1 > BlkRaison.Param.MinBC){
			$gameParty.gainItem(this.item(this._actorCardsWindow),1,false);
			this._actorCardsWindow._actor._deckList.splice(this._actorCardsWindow.index(),1);

		}
		this._actorCardsWindow.refresh();
		this._partyCardsWindow.refresh();
		this._actorCardsWindow.activate();
		this._actorCardsWindow.select(0);	
	};

	Scene_Deck.prototype.onItemCancel = function() {
	    this._partyCardsWindow.deselect();
	    this._categoryWindow.activate();
	};

	Scene_Deck.prototype.onItemCancel2 = function() {
		this._deckEditCommand.show();
		this._deckEditCommand.activate();
	    this._actorCardsWindow.deselect();
	    this._deckEditCommand.activate();
	};

	Scene_Deck.prototype.playSeForItem = function() {
	    SoundManager.playUseItem();
	};

	Scene_Deck.prototype.useItem = function() {
	    Scene_ItemBase.prototype.useItem.call(this);
	    this._partyCardsWindow.redrawCurrentItem();
	};

	//-----------------------------------------------------------------------------
	// Window_DeckEditOptions
	//
	// The window for selecting a category of items on the item and shop screens.

	function Window_DeckEditOptions() {
	    this.initialize.apply(this, arguments);
	}

	Window_DeckEditOptions.prototype = Object.create(Window_HorzCommand.prototype);
	Window_DeckEditOptions.prototype.constructor = Window_DeckEditOptions;

	Window_DeckEditOptions.prototype.initialize = function(x, y) {
	    Window_HorzCommand.prototype.initialize.call(this, x, y);
	};

	Window_DeckEditOptions.prototype.windowWidth = function() {
	    return Graphics.boxWidth;
	};


	Window_DeckEditOptions.prototype.maxCols = function() {
	    return 2;
	};

	Window_DeckEditOptions.prototype.update = function() {
	    Window_HorzCommand.prototype.update.call(this);
	    if (this._itemWindow) {
	        this._itemWindow.setCategory(this.currentSymbol());
	    }
	};

	Window_DeckEditOptions.prototype.makeCommandList = function() {
	    this.addCommand("Add",    'add');
	    this.addCommand("Remove",  'remove');
	};

	Window_DeckEditOptions.prototype.setItemWindow = function(itemWindow) {
	    this._itemWindow = itemWindow;
	    this.update();
	};

	//==========================================================================
	function Scene_Cards() {
	    this.initialize.apply(this, arguments);
	};

	Scene_Cards.prototype = Object.create(Scene_ItemBase.prototype);
	Scene_Cards.prototype.constructor = Scene_Cards;

	Scene_Cards.prototype.initialize = function() {
	    Scene_ItemBase.prototype.initialize.call(this);
	    this._isInSwap = false;
	};

	Scene_Cards.prototype.create = function() {
	    Scene_ItemBase.prototype.create.call(this);
	    this.createCategoryWindow();
	    //this.createDeckEditCommandWindow();
	    this.createHelpWindow();
	    this.createPartyCardsWindow(Graphics.width/4,Graphics.height/10,Graphics.width/2,Graphics.height*9/10);
	    //this.createActorCardsWindow();
	    //this.createCardCounterWindow();
	    //this.createActorWindow();
	    //this.refreshActor();
	};

	Scene_Cards.prototype.createCategoryWindow = function() {
	    this._categoryWindow = new Window_VerticalCardCategory();
	    //this._categoryWindow.setHelpWindow(this._helpWindow);
	    this._categoryWindow.y = 0;//this._helpWindow.height;
	    this._categoryWindow.setHandler('ok',     this.onCategoryOk.bind(this));
	    this._categoryWindow.setHandler('cancel', this.popScene.bind(this));
	    this.addWindow(this._categoryWindow);
	    this._categoryWindow.select(0);
	    this._categoryWindow.refresh();
	};

	Scene_Cards.prototype.createHelpWindow = function() {
		this._helpWindow = new Window_CardDetails(Graphics.boxWidth/3,this._categoryWindow.height,Graphics.boxWidth/3,(Graphics.height*3/4) - this._categoryWindow.height);
		this._helpWindow.show();
		this.addWindow(this._helpWindow);
	};

	Scene_Cards.prototype.onCategoryOk = function() {

	};


	Scene_Cards.prototype.createPartyCardsWindow = function(x,y,width,height) {
	    this._partyCardsWindow = new Window_PartyCardList(x, y, width, height);
	    this._partyCardsWindow.setHelpWindow(this._helpWindow);	   
	    //this._partyCardsWindow.setHandler('cancel', this.onItemCancel.bind(this));
	    this.addWindow(this._partyCardsWindow);
	    this._categoryWindow.setItemWindow(this._partyCardsWindow);
	};


	//============================================================================
	//Window_VerticalCardCategory
	//============================================================================

   function Window_VerticalCardCategory() {
	    this.initialize.apply(this, arguments);
	};

	Window_VerticalCardCategory.prototype = Object.create(Window_Command.prototype);
	Window_VerticalCardCategory.prototype.constructor = Window_VerticalCardCategory;

	Window_VerticalCardCategory.prototype.initialize = function() {
	    Window_Command.prototype.initialize.call(this, 0, 0);
	};

	Window_VerticalCardCategory.prototype.makeCommandList = function(){
		DataManager._cardTypes.forEach(function(type){
	    	var name = type.charAt(0).toUpperCase() + type.slice(1);
	    	this.addCommand(name,type);
	    },this);
	};

	Window_VerticalCardCategory.prototype.windowWidth = function() {
	    return Graphics.boxWidth / 4;
	};

	Window_VerticalCardCategory.prototype.windowHeight = function() {
		return Graphics.boxHeight;
	};

	Window_VerticalCardCategory.prototype.setItemWindow = function(itemWindow) {
	    this._partyCardsWindow = itemWindow;
	    this.update();
	};

	//-----------------------------------------------------------------------------
	// Window_CardType
	//
	// The window for selecting a category of items on the item and shop screens.

	function Window_CardType() {
	    this.initialize.apply(this, arguments);
	}

	Window_CardType.prototype = Object.create(Window_HorzCommand.prototype);
	Window_CardType.prototype.constructor = Window_CardType;

	Window_CardType.prototype.initialize = function() {
	    Window_HorzCommand.prototype.initialize.call(this, 0, 0);
	    this._actor = null
	};

	Window_CardType.prototype.windowWidth = function() {
	    return Graphics.boxWidth;
	};

	Window_CardType.prototype.maxCols = function() {
	    return 4;
	};

	Window_CardType.prototype.setActor = function(actor) {
		if (this._actor !== actor) {
			this._actor = actor;
			this.refresh();
		}
	}

	Window_CardType.prototype.update = function() {
	    Window_HorzCommand.prototype.update.call(this);
	    if (this._partyCardsWindow) {
	        this._partyCardsWindow.setCategory(this.currentSymbol());
	    }
	};

	Window_CardType.prototype.makeCommandList = function() {
	    DataManager._cardTypes.forEach(function(type){
	    	var name = type.charAt(0).toUpperCase() + type.slice(1);
	    	if (this._actor){
	    		if (this._actor._compatibleCardTypes.indexOf(type) > -1){
		    		this.addCommand(name, type);
		    	}
	    	}
	    }, this);
	};

	Window_CardType.prototype.setItemWindow = function(itemWindow) {
	    this._partyCardsWindow = itemWindow;
	    this.update();
	};


	//-----------------------------------------------------------------------------
	// Window_PartyCardList
	//
	// The window for selecting an item on the item screen.

	function Window_PartyCardList() {
	    this.initialize.apply(this, arguments);
	}

	Window_PartyCardList.prototype = Object.create(Window_Selectable.prototype);
	Window_PartyCardList.prototype.constructor = Window_PartyCardList;

	Window_PartyCardList.prototype.initialize = function(x, y, width, height) {
	    Window_Selectable.prototype.initialize.call(this, x, y, width, height);
	    this._category = 'none';
	    this._data = [];
	};

	Window_PartyCardList.prototype.setCategory = function(category) {
	    if (this._category !== category) {
	        this._category = category;
	        this.refresh();
	        this.resetScroll();
	    }
	};

	Window_PartyCardList.prototype.maxCols = function() {
	    return 1;
	};

	Window_PartyCardList.prototype.spacing = function() {
	    return 48;
	};

	Window_PartyCardList.prototype.maxItems = function() {
	    return this._data ? this._data.length : 1;
	};

	Window_PartyCardList.prototype.item = function() {
	    var index = this.index();
	    return this._data && index >= 0 ? this._data[index] : null;
	};

	Window_PartyCardList.prototype.isCurrentItemEnabled = function() {
	    return this.isEnabled(this.item());
	};

	Window_PartyCardList.prototype.includes = function(item) {
		_BLKR_Category_RegExp(this,item);
	};

	Window_PartyCardList.prototype.needsNumber = function() {
	    return true;
	};

	Window_PartyCardList.prototype.isEnabled = function(item) {
	    return $gameParty.canUse(item);
	};

	Window_PartyCardList.prototype.makeItemList = function() {
	    this._data = $gameParty.items().filter(function(item) {
	        return this.includes(item);
	    }, this);
	    if (this.includes(null)) {
	        this._data.push(null);
	    }
	};

	Window_PartyCardList.prototype.selectLast = function() {
	    var index = this._data.indexOf($gameParty.lastItem());
	    this.select(index >= 0 ? index : 0);
	};

	Window_PartyCardList.prototype.drawItem = function(index) {
	    var item = this._data[index];
	    if (item) {
	        var numberWidth = this.numberWidth();
	        var rect = this.itemRect(index);
	        rect.width -= this.textPadding();
	        this.changePaintOpacity(this.isEnabled(item));
	        this.drawItemName(item, rect.x, rect.y, rect.width - numberWidth);
	        this.drawItemNumber(item, rect.x, rect.y, rect.width);
	        this.changePaintOpacity(1);
	    }
	};

	Window_PartyCardList.prototype.numberWidth = function() {
	    return this.textWidth('000');
	};

	Window_PartyCardList.prototype.drawItemNumber = function(item, x, y, width) {
	    if (this.needsNumber()) {
	        this.drawText(':', x, y, width - this.textWidth('00'), 'right');
	        this.drawText($gameParty.numItems(item), x, y, width, 'right');
	    }
	};

	Window_PartyCardList.prototype.updateHelp = function() {
	    this.setHelpWindowItem(this.item());
	};

	Window_PartyCardList.prototype.refresh = function() {
	    this.makeItemList();
	    this.createContents();
	    this.drawAllItems();
	};

	//-----------------------------------------------------------------------------
	// Window_ActorCardList
	//
	// The window for selecting an item on the item screen.

	function Window_ActorCardList() {
	    this.initialize.apply(this, arguments);
	}

	Window_ActorCardList.prototype = Object.create(Window_Selectable.prototype);
	Window_ActorCardList.prototype.constructor = Window_ActorCardList;

	Window_ActorCardList.prototype.initialize = function(x, y, width, height) {
	    Window_Selectable.prototype.initialize.call(this, x, y, width, height);
	    this._category = 'none';
	    this._data = [];
	};

	/*Window_ActorCardList.prototype.setCategory = function(category) {
	    if (this._category !== category) {
	        this._category = category;
	        this.refresh();
	        this.resetScroll();
	    }
	};*/

	Window_ActorCardList.prototype.setActor = function(actor) {
	    if (this._actor !== actor) {
	        this._actor = actor;
	        this.refresh();
	        this.resetScroll();
	    }
	};

	Window_ActorCardList.prototype.maxCols = function() {
	    return 1;
	};

	Window_ActorCardList.prototype.spacing = function() {
	    return 48;
	};

	Window_ActorCardList.prototype.maxItems = function() {
	    return this._data ? this._data.length : 1;
	};

	Window_ActorCardList.prototype.item = function() {
	    var index = this.index();
	    return this._data && index >= 0 ? this._data[index] : null;
	};

	Window_ActorCardList.prototype.isCurrentItemEnabled = function() {
	    return this.isEnabled(this.item());
	};

	Window_ActorCardList.prototype.includes = function(item) {
		_BLKR_Category_RegExp(this,item);
	};

	Window_ActorCardList.prototype.needsNumber = function() {
	    return true;
	};

	Window_ActorCardList.prototype.isEnabled = function(item) {
	    return $gameParty.canUse(item);
	};

	Window_ActorCardList.prototype.makeItemList = function() {
	    if (this._actor){
	    	this._data = this._actor._deckList;
	    }
	};

	Window_ActorCardList.prototype.selectLast = function() {
	    var index = this._data.indexOf($gameParty.lastItem());
	    this.select(index >= 0 ? index : 0);
	};

	Window_ActorCardList.prototype.drawItem = function(index) {
	    var item = this._data[index];
	    if (item) {
	        var numberWidth = this.numberWidth();
	        var rect = this.itemRect(index);
	        rect.width -= this.textPadding();
	        this.changePaintOpacity(this.isEnabled(item));
	        this.drawItemName(item, rect.x, rect.y, rect.width - numberWidth);
	        //this.drawItemNumber(item, rect.x, rect.y, rect.width);
	        this.changePaintOpacity(1);
	    }
	};

	Window_ActorCardList.prototype.numberWidth = function() {
	    return this.textWidth('000');
	};

	Window_ActorCardList.prototype.updateHelp = function() {
	    this.setHelpWindowItem(this.item());
	};

	Window_ActorCardList.prototype.refresh = function() {
	    this.makeItemList();
	    this.createContents();
	    this.drawAllItems();
	};

	//=========================================================================
	//	Segment to make CARDS menu entry (VIEW ALL CARDS IN POSESSION)
	//-----------------------------------------------------------------------------
	// Window_ViewCards
	//
	// The window for selecting an item on the item screen.

	function Window_ViewCards() {
	    this.initialize.apply(this, arguments);
	}

	Window_ViewCards.prototype = Object.create(Window_Selectable.prototype);
	Window_ViewCards.prototype.constructor = Window_ViewCards;

	Window_ViewCards.prototype.initialize = function(x, y, width, height) {
	    Window_Selectable.prototype.initialize.call(this, x, y, width, height);
	    this._category = 'none';
	    this._data = [];
	};

	Window_ViewCards.prototype.setCategory = function(category) {
	    if (this._category !== category) {
	        this._category = category;
	        this.refresh();
	        this.resetScroll();
	    }
	};

	Window_ViewCards.prototype.maxCols = function() {
	    return 2;
	};

	Window_ViewCards.prototype.spacing = function() {
	    return 48;
	};

	Window_ViewCards.prototype.maxItems = function() {
	    return this._data ? this._data.length : 1;
	};

	Window_ViewCards.prototype.item = function() {
	    var index = this.index();
	    return this._data && index >= 0 ? this._data[index] : null;
	};

	Window_ViewCards.prototype.isCurrentItemEnabled = function() {
	    return this.isEnabled(this.item());
	};

	Window_ViewCards.prototype.includes = function(item) {
	    _BLKR_Category_RegExp(this,item)
	};

	Window_ViewCards.prototype.needsNumber = function() {
	    return true;
	};

	Window_ViewCards.prototype.isEnabled = function(item) {
	    return $gameParty.canUse(item);
	};

	Window_ViewCards.prototype.makeItemList = function() {
	    this._data = $gameParty.items().filter(function(item) {
	        return this.includes(item);
	    }, this);
	    if (this.includes(null)) {
	        this._data.push(null);
	    }
	};

	Window_ViewCards.prototype.selectLast = function() {
	    var index = this._data.indexOf($gameParty.lastItem());
	    this.select(index >= 0 ? index : 0);
	};

	Window_ViewCards.prototype.drawItem = function(index) {
	    var item = this._data[index];
	    if (item) {
	        var numberWidth = this.numberWidth();
	        var rect = this.itemRect(index);
	        rect.width -= this.textPadding();
	        this.changePaintOpacity(this.isEnabled(item));
	        this.drawItemName(item, rect.x, rect.y, rect.width - numberWidth);
	        this.drawItemNumber(item, rect.x, rect.y, rect.width);
	        this.changePaintOpacity(1);
	    }
	};

	Window_ViewCards.prototype.numberWidth = function() {
	    return this.textWidth('000');
	};

	Window_ViewCards.prototype.drawItemNumber = function(item, x, y, width) {
	    if (this.needsNumber()) {
	        this.drawText(':', x, y, width - this.textWidth('00'), 'right');
	        this.drawText($gameParty.numItems(item), x, y, width, 'right');
	    }
	};

	Window_ViewCards.prototype.updateHelp = function() {
	    this.setHelpWindowItem(this.item());
	};

	Window_ViewCards.prototype.refresh = function() {
	    this.makeItemList();
	    this.createContents();
	    this.drawAllItems();
	};
	
	//-----------------------------------------------------------------------
	// Actor card counter
	//-------------------------------------------------------------------------

	function Window_ActorCardCounter() {
	    this.initialize.apply(this, arguments);
	}

	Window_ActorCardCounter.prototype = Object.create(Window_Base.prototype);
	Window_ActorCardCounter.prototype.constructor = Window_ActorCardCounter;

	Window_ActorCardCounter.prototype.initialize = function(x,y,width,height) {
	    Window_Base.prototype.initialize.call(this, x, y, width, height);
	    this.show();
	};

	Window_ActorCardCounter.prototype.setActor = function(actor){
		this._actor = actor;
		this.refresh();
	};

	Window_ActorCardCounter.prototype.refresh = function(){
		this.createContents();
		this.drawBasicInfo(0,0);
	};

	Window_ActorCardCounter.prototype.drawBasicInfo = function(x, y) {
	    var lineHeight = this.lineHeight();
	    this.drawActorFace(this._actor, this.width/2, y);
	    this.drawActorLevel(this._actor, x, y + lineHeight * 0);
	    //this.drawActorIcons(this._actor, x, y + lineHeight * 1);
	    this.drawActorHp(this._actor, x, y + lineHeight * 2);
	    this.drawActorMp(this._actor, x, y + lineHeight * 3);
	};

	//===============================================================
	function Window_CardDetails() {
	    this.initialize.apply(this, arguments);
	}

	Window_CardDetails.prototype = Object.create(Window_Base.prototype);
	Window_CardDetails.prototype.constructor = Window_CardDetails;

	Window_CardDetails.prototype.initialize = function(x,y,width,height) {
	    Window_Base.prototype.initialize.call(this, x, y, width, height);
	    this.show();
	    this._text = "";
	};

	Window_CardDetails.prototype.refresh = function(){
		this.contents.clear();
		this.drawTextEx(this._text, this.textPadding(), 0);
	};

	Window_CardDetails.prototype.standardFontSize = function() {
	    return 18;
	};

	Window_CardDetails.prototype.setActor = function(actor){
		this._actor = actor;
	}

	Window_CardDetails.prototype.setText = function(text) {
	    if (this._text !== text) {
	        this._text = text;
	        this.refresh();
	    }
	};

	Window_CardDetails.prototype.setItem = function(item) {
		if (item){
			var type = item.hitType;
			switch(type){
				case 0:
					type = "Unblockable";
					break;
				case 1:
					type = "Physical";
					break;
				case 2:
					type = "Magical";
					break;
			}
			var string1 = item.name + "\n\n" + item.description + "\n\n" + "Stats\n"+ "Speed: +" + item.speed + "\n" + "Success Rate: " + item.successRate + "%\n";
			var type2 = item.damage.type;
			switch(type2){
				case 0:
					type2 = "None";
					break;
				case 1:
					type2 = "HP Damage";
					break;
				case 2:
					type2 = "MP Damage";
					break;
				case 3:
					type2 = "HP Recovery";
					break;
				case 4:
					type2 = "MP Recovery";
					break;
				case 5:
					type2 = "HP Drain";
					break;
				case 6:
					type2 = "MP Drain";
					break;
			}
			var element = $dataSystem.elements[item.damage.elementId];
			var effective = item.damage.formula;

			var a = this._actor;
			var b = this._actor;

			var res = eval(effective);
			var string2 = "Hit Type: " + type + "\nDamage Type: " + type2 + "\nElement: " + element + "\nApproximate Damage: " + res;
			this.setText(string1 + string2);
		}
	  
	};

	//=====================================================================================//
	//=================================YANFLY BCE COMPATIBILITY============================//
	//=====================================================================================//
	Window_Help.prototype.setActor = function(actor){
		this._actor = actor;
	}

	Window_BattleActor.prototype.setActor = function(actor){
		this._actor = actor;
	};

	if (BlkRaison.Param.UsingYBCE === 'true'){
		//Some sprite behavior edits
		Game_Battler.prototype.performActionStart = function(action) {
		    if (!action.isGuard()) {
		        this.setActionState('acting');
		        
		        	if (!this._startedAction){
		        		this.spriteStepForward();
		        		this._startedAction = true;
		        	}
		          
		             	        
		    }
		};

		Game_Battler.prototype.spriteReturnHome = function() {
		    if ($gameSystem.isSideView() && this.battler()) {
		    	this._flinched = false;
				this.spriteFaceForward();
				if (this.isActor()){
					if (this._actionInputIndex === 0){
						this.battler().stepBack();
						this._startedAction = false;
					}
				}
				else{
						this.battler().stepBack();
					
				}
					
		      if (this.numActions() <= 0) {
		        this.setActionState('undecided');
		      }
		      this.battler().refreshMotion();
		    }
		};
	}
	
	//===========================================================================
	//Future Notes
	//===========================================================================
	var _BLKR_Category_RegExp = function(obj,item){
		if (item != null){
			if (item.meta.card != null){ //is a card
				var regex = item.note.match(/<(?:Card Type):[ ]*(\w+\s*)>/i);
				if (regex){
					var val = RegExp.$1.match(/\w+/i);
					if (val[0] === obj._category){
						return true;
					}
				}
		    }
		}	    
	    return false;
	};
	

})();