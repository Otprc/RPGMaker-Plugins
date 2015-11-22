
//=============================================================================
/*:
 * @plugindesc Battle System
 * @author BlkRaison
 *
 * @param No Battle Start Message
 * @desc Removes the encounter message at the beginning of a battle, 0 true 1 false
 * Default: 0
 * @default 0
 *
 * @param Max Atb
 * @desc Define the maximum value the atb counter can reach
 * Default: 1000
 * @default 1000
 *
 * @param TestMode
 * @desc Define the maximum value the atb counter can reach
 * Default: 0
 * @default 0
 * 
 * 
 */

(function(){
	var BlkRaison = BlkRaison || {};

	BlkRaison.Parameters = PluginManager.parameters('BattleSystemv2');
	BlkRaison.Param = BlkRaison.Param || {};

	BlkRaison.Param.NoBattleStartMessage = Number(BlkRaison.Parameters['No Battle Start Message']);
	BlkRaison.Param.MaxAtb = Number(BlkRaison.Parameters['Max Atb']);
	BlkRaison.Param.TestMode = Number(BlkRaison.Parameters['TestMode']);

	//==================================================
    // INTERFACE
    //==================================================
   
    //Let's increase the area for gauges in the battlescreen from the default value of 330 to 400.
    Window_BattleStatus.prototype.gaugeAreaWidth = function() {
   		return 400;
    };
   
    //let's change the DrawGaugeArea methods, to include our ATB gauge.
    //The version with TP:
    Window_BattleStatus.prototype.drawGaugeAreaWithTp = function(rect, actor) {
        this.drawActorHp(actor, rect.x + 0, rect.y, 97);
        this.drawActorMp(actor, rect.x + 112, rect.y, 86);
        this.drawActorTp(actor, rect.x + 213, rect.y, 86);
        this.drawActorATB(actor, rect.x + 314, rect.y, 86);
    };
   
    //The version without TP:
    Window_BattleStatus.prototype.drawGaugeAreaWithoutTp = function(rect, actor) {
        this.drawActorHp(actor, rect.x + 0, rect.y, 130);
        this.drawActorMp(actor, rect.x + 145,  rect.y, 120);
        this.drawActorATB(actor, rect.x + 280,  rect.y, 120);
    };
   
    //Let's create the method that draw the ATB gauge:
    Window_Base.prototype.drawActorATB = function(actor, x, y, width) {
        var color1 = "#303050";
        var color2 = "#6060A0";
        this.drawGauge(x, y, width, actor.atbRate(), color1, color2);
        this.changeTextColor(this.systemColor());
        this.drawText("AT", x, y, 44);
    };
   
    //Let's create the method for calculating ATB percent for the gauge:
    Game_BattlerBase.prototype.atbRate = function() {
        if (typeof this.atb !== 'undefined') {
            if (this.atb / BlkRaison.Param.MaxAtb >= 1)
            {
                return 1;
            }
            return this.atb / BlkRaison.Param.MaxAtb;
        }
        return 0;
    };

    //========================================================================
	//Active Time Battle Variables and Functions
	//========================================================================
	 Object.defineProperties(Game_BattlerBase.prototype, {
        atb: {
            writable: true,
            value: 0,
            configurable: true,
            enumerable: true
        }
    });
	var _actorQueue = [];
	var _enemyQueue = [];

	//========================================================================
	//Initial Startup
	//========================================================================
	_BLKR_BattleManager_StartBattle = BattleManager.startBattle;
	BattleManager.startBattle = function(){
		if (BlkRaison.Param.NoBattleStartMessage == 0){
			$gameSystem.onBattleStart();
		    $gameParty.onBattleStart();
		    $gameTroop.onBattleStart();
		}
		else{
			_BLKR_BattleManager_StartBattle.call(this);
		}
		this._phase = 'atb_idle';
	};

	//Clear Atb of all battlers at the start of the battle
	_BLKR_Game_Battler_onBattleStart = Game_Battler.prototype.onBattleStart;
	Game_Battler.prototype.onBattleStart = function() {
		_BLKR_Game_Battler_onBattleStart.call(this);
		this.clearAtb();
		this._isOnQueue = false;
	}
	
	//========================================================================
	//Initial Startup
	//========================================================================

	Game_Battler.prototype.clearAtb = function(){
		this.atb = 0;
		//console.log(this.name() + " has sprite dimensions (" + this.spriteWidth() + ", " + this.spriteHeight() + ")");
	}
	Game_Battler.prototype.setAtb = function(value){
		this.atb = value;
	}
	Game_Battler.prototype.hasFullAtb = function(){
		if (this.atb > BlkRaison.Param.MaxAtb){
			if (!this._isOnQueue){
				this._isOnQueue = true;
				if (this.isActor()){
					_actorQueue.push(this);
				}
				else{
					_enemyQueue.push(this);
				}
			}
			return true;
		}
		return false;
	}

	//Increments via update call
	BattleManager.incrementAtb = function(){
		this.allBattleMembers().forEach(function(battler){
			if (!battler.hasFullAtb() && !battler.isDead()){
				battler.atb = battler.atb + 25 * Math.sqrt(battler.agi)/100;
			}
	        this.refreshStatus();
		},this);
	}	

	//Constantly updates the ATB bar
	_BLKR_SceneManager_update = SceneManager.update;
	SceneManager.update = function(){
		_BLKR_SceneManager_update.call(this);
		//Update ATB Timer
		if (BattleManager._phase === 'input' || BattleManager._phase === 'atb_idle'){
			BattleManager.incrementAtb();
		}
	} 

	BattleManager.changeActorState = function(state){
		var actor = this.actor();
		if (actor){
			actor.setActionState(state);
		}
	};

	_BLKR_BattleManager_update = BattleManager.update;
	BattleManager.update = function(){
		if (!this.isBusy() && !this.updateEvent()){
			if (this._phase === 'atb_idle'){

				if (_enemyQueue.length > 0){
					this._subject = _enemyQueue.shift();
					this._subject.makeActions();
					this._phase = 'turn';
				}
				else if (_actorQueue.length > 0){
					this._subject = _actorQueue.shift();
					this._subject.makeActions();
					if (this._subject.canInput()){
						this.changeActorState('inputting');
						this._subject.requestMotionRefresh();
						if (this._subject._isGuarding){
							this._subject._isGuarding = false;
							this._subject.removeState(2);
						}
						this._actorIndex = this._subject.index();
						this._phase = 'input';
					}
					else{
						this._phase = 'turn';
					}
				}
			}
		}
		_BLKR_BattleManager_update.call(this);
	}

	BattleManager.updateTurn = function() {
	    $gameParty.requestMotionRefresh();

	    if (this._subject) {
	        this.processTurn();
	    } else {
	        this.endTurn();
	    }
	};

	BattleManager.processTurn = function() {
	    var subject = this._subject;
	    var action = subject.currentAction();
	    
	    if (action) {
	        action.prepare();
	        if (action.isValid()) {
	            this.startAction();
	        }
	        subject.removeCurrentAction();
	    } else {
	        subject.onAllActionsEnd();
	        this.refreshStatus();
	        this._logWindow.displayAutoAffectedStatus(subject);
	        this._logWindow.displayCurrentState(subject);
	        this._logWindow.displayRegeneration(subject);
	        this.endTurn();
	    }
	};

	//Edits to make this work
	BattleManager.selectNextCommand = function(){
		do {
	        if (!this.actor() || !this.actor().selectNextCommand()) {
	            this.updateTurn();
	            break;
	        }
	    } while (!this.actor().canInput());
	}

	BattleManager.getNextSubject = function(){
		return null;
	}

	BattleManager.selectPreviousCommand = function() {
	        
	};

	//Modify turn end so that the display only shows the log for the specific battler
	BattleManager.endTurn = function() {
	    this._phase = 'turnEnd';
	    this._preemptive = false;
	    this._surprise = false;
        this.refreshStatus();
        this._logWindow.displayAutoAffectedStatus(this._subject);
        this._logWindow.displayRegeneration(this._subject);
        //Added stuff
        this.changeActorState('undecided');
        this._subject.clearAtb();
		this._subject.onTurnEnd();
        this._subject._isOnQueue = false;
        this._subject = null;
	};

	 //Change the end of turn:
	BattleManager.updateTurnEnd = function() {
	    this._phase = 'atb_idle';
	};

	//Dead battlers don't increment ATB
	_BLKR_Game_BattlerBase_die = Game_BattlerBase.prototype.die;
	Game_BattlerBase.prototype.die = function() {
	    _BLKR_Game_BattlerBase_die.call(this);
	    this.clearAtb();
	};

	//Clear variables at the end of battle
	_BLKR_BattleManager_endBattle = BattleManager.endBattle;
	BattleManager.endBattle = function(result) {
	    _BLKR_BattleManager_endBattle.call(this);
	    _actorQueue = [];
	    _enemyQueue = [];

	};

	Game_Action.prototype.setGuard = function() {
	    this.setSkill(this.subject().guardSkillId());
	    this.subject()._isGuarding = true;
	};
})();
